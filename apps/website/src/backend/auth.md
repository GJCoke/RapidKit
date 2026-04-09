# 认证与权限

## 认证架构

项目采用 JWT 双 Token 机制配合 RSA 非对称加密，实现安全的用户认证体系。

| Token 类型    | 算法  | 默认有效期 | 用途              |
| ------------- | ----- | ---------- | ----------------- |
| Access Token  | HS256 | 1 天       | API 请求认证      |
| Refresh Token | HS256 | 1 周       | 刷新 Access Token |

RSA 密钥对用于前端登录密码加密传输，服务端使用私钥解密后再进行 bcrypt 校验。

认证配置集中在 `src/core/config.py` 的 `AuthConfig` 类中：

```python
class AuthConfig(BaseSettings):
    JWT_ALG: str = "HS256"

    ACCESS_TOKEN_KEY: AccessSecret
    ACCESS_TOKEN_EXP: timedelta = timedelta(seconds=1 * DAYS)     # 默认 1 天

    REFRESH_TOKEN_KEY: RefreshSecret
    REFRESH_TOKEN_EXP: timedelta = timedelta(seconds=1 * WEEKS)   # 默认 1 周

    RSA_PRIVATE_KEY: RSAPrivateKey
    RSA_PUBLIC_KEY: Secret[str]
```

## 密钥配置

| 环境变量            | 说明                             |
| ------------------- | -------------------------------- |
| `ACCESS_TOKEN_KEY`  | Access Token 签名密钥            |
| `REFRESH_TOKEN_KEY` | Refresh Token 签名密钥           |
| `RSA_PRIVATE_KEY`   | RSA 私钥（文件路径或内联字符串） |
| `RSA_PUBLIC_KEY`    | RSA 公钥（文件路径或内联字符串） |

密钥生成策略因环境而异：

- **非部署环境**（LOCAL / TESTING）：缺少密钥时自动生成。Token 密钥使用 `secrets.token_urlsafe(32)`，RSA 密钥使用 `generate_rsa_key_pair()`。
- **部署环境**（STAGING / PRODUCTION）：必须在 `.env` 中显式配置，缺少时启动报错。

:::danger
生产环境必须配置固定密钥。动态生成的密钥在多实例部署时会导致 Token 校验失败。
:::

RSA 密钥支持两种配置方式：

```bash
# 方式一：文件路径
RSA_PRIVATE_KEY=/path/to/private.pem
RSA_PUBLIC_KEY=/path/to/public.pem

# 方式二：内联字符串
RSA_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."
```

## 认证流程

完整的认证流程如下：

1. 用户提交登录请求，密码经 RSA-OAEP (SHA-256) 公钥加密传输
2. 服务端使用 RSA 私钥（OAEP padding）解密密码
3. 使用 bcrypt 校验密码是否正确
4. 校验通过后签发 Access Token + Refresh Token
5. 前端在后续请求的 `Authorization: Bearer <access_token>` 头中携带 Access Token
6. Access Token 过期后，使用 `x-refresh-token` 头携带 Refresh Token 请求刷新
7. 服务端校验 Refresh Token 有效性（含 Redis 存储校验 + User-Agent 比对）
8. 校验通过后签发新的 Token 对

:::info
Refresh Token 存储在 Redis 中，key 格式为 `auth:refresh:<user_id>:<jti>`，支持多设备登录和单设备踢下线。
:::

## RBAC 权限体系

权限系统分为三个层级，覆盖前后端完整的访问控制需求：

| 层级     | 字段                    | 说明                  |
| -------- | ----------------------- | --------------------- |
| 路由权限 | `router_permissions`    | 前端页面路由访问控制  |
| 接口权限 | `interface_permissions` | 后端 API 端点访问控制 |
| 按钮权限 | `button_permissions`    | 前端 UI 按钮显示控制  |

角色模型定义（`src/domains/role/models.py`）：

```python
class Role(SQLModel, table=True):
    __tablename__ = "manage_roles"

    name: str = Field(..., unique=True, min_length=2, max_length=100, description="角色名称")
    description: str | None = Field(None, max_length=500, description="角色描述")
    code: str = Field(..., unique=True, min_length=5, max_length=100, description="角色编码")
    status: Status = Field(Status.ON, description="角色状态")
    interface_permissions: list[str] = Field([], sa_column=Column(JSON), description="接口权限编码列表")
    button_permissions: list[str] = Field([], sa_column=Column(JSON), description="按钮权限编码列表")
    router_permissions: list[str] = Field([], sa_column=Column(JSON), description="路由权限编码列表")
```

接口权限通过 `InterfaceRouter` 模型动态注册，格式为 `METHOD:path`（如 `GET:POST:/api/v1/users`）。

## 权限验证

权限验证通过 `verify_user_permission` 依赖实现（`src/domains/role/deps.py`）。

验证流程：

1. 从 JWT Token 中提取用户信息
2. 判断用户是否为管理员（`is_admin`），管理员跳过权限校验
3. 从 Redis 缓存查询用户权限列表（key: `auth:permission:<user_id>`）
4. 缓存未命中时，从数据库查询角色权限并写入 Redis（过期时间与 Access Token 一致）
5. 将当前请求路径拼接为 `METHOD:path` 格式，与权限列表比对
6. 匹配通过则放行，否则抛出 `ROLE_PERMISSION_DENIED` 异常

```python
async def verify_user_permission(user: UserDBDep, route: RequestRouterDep, redis: RedisDep, role: RoleCrudDep) -> User:
    if not user.is_admin:
        redis_key = permission_structure.format(user_id=user.id)
        cache = await redis.get(redis_key, response_model=UserPermissionCache)
        if cache:
            user_permission_list = cache.permissions
        else:
            user_permission_list = await create_user_permission_cache(user.id, user.roles, redis, role)

        route_key = f"{':'.join(route.methods)}:{route.path}"
        if route_key not in user_permission_list:
            raise AppException(StatusCode.ROLE_PERMISSION_DENIED)

    return user
```

## 依赖注入

项目提供多个认证相关的 FastAPI 依赖项，按需选用：

| 依赖                  | 说明                                                |
| --------------------- | --------------------------------------------------- |
| `UserAccessJWTDep`    | 仅解析 Access Token，返回 JWT payload（不查数据库） |
| `UserDBDep`           | 解析 Token 后查数据库，返回完整 `User` 模型         |
| `UserRefreshDep`      | 校验 Refresh Token（Redis + DB），用于 Token 刷新   |
| `VerifyPermissionDep` | 完整权限校验，含 RBAC 接口权限判断                  |
| `AuthCrudDep`         | 注入 `UserCRUD` 实例                                |

在路由中使用：

```python
from src.domains.auth.deps import UserDBDep
from src.domains.role.deps import VerifyPermissionDep


# 仅需登录认证
@router.get("/profile")
async def get_profile(user: UserDBDep):
    return user


# 需要接口权限校验
@router.delete("/users/{user_id}")
async def delete_user(user: VerifyPermissionDep, user_id: UUID):
    ...
```
