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

## 前端认证流程

前端认证基于 Pinia auth store 实现，完整覆盖登录、Token 管理、路由守卫和自动刷新。

### 登录流程

登录过程分为密码加密、接口调用、Token 存储和用户信息获取四个步骤：

1. **获取 RSA 公钥**：调用 `GET /api/v1/auth/keys/public` 获取服务端 RSA 公钥
2. **RSA-OAEP 加密密码**：使用 Web Crypto API 对用户密码进行 RSA-OAEP (SHA-256) 加密
3. **提交登录请求**：调用 `POST /api/v1/auth/login`，传递用户名和加密后的密码
4. **存储 Token**：将返回的 `accessToken` 和 `refreshToken` 存入 localStorage
5. **获取用户信息**：调用 `GET /api/v1/auth/user/info` 获取用户详细信息
6. **初始化权限路由**：根据用户角色初始化前端路由和菜单

核心代码在 `src/store/modules/auth/index.ts`：

```typescript
async function login(username: string, password: string, redirect = true) {
  // 1. 获取 RSA 公钥
  const { data: publicKey } = await fetchGetPublicKey()

  // 2. RSA-OAEP (SHA-256) 加密密码
  const { data: loginToken, error } = await fetchLogin({
    username,
    password: await rsaEncrypt(publicKey!, password),
  })

  // 3. 存储 Token 并获取用户信息
  if (!error) {
    const pass = await loginByToken(loginToken)
    if (pass) {
      await redirectFromLogin(redirect)
    }
  }
}
```

### Token 存储

Token 存储在 localStorage 中，key 带有 `VITE_STORAGE_PREFIX` 前缀（默认 `SOY_`）以隔离不同项目的存储：

| 存储 Key               | 说明                                 |
| ---------------------- | ------------------------------------ |
| `{prefix}token`        | Access Token，用于 API 请求认证      |
| `{prefix}refreshToken` | Refresh Token，用于刷新 Access Token |

Token 的读写通过 `localStg` 工具函数封装，位于 `src/store/modules/auth/shared.ts`：

```typescript
export function getToken() {
  return localStg.get("token") || ""
}

export function clearAuthStorage() {
  localStg.remove("token")
  localStg.remove("refreshToken")
}
```

### Auth Store 状态流

auth store 管理完整的认证状态，核心流程为：

```
login()
  → fetchLogin() 获取 Token
    → loginByToken() 存储 Token
      → getUserInfo() 获取用户信息
        → routeStore.initAuthRoute() 初始化权限路由
```

store 对外暴露的关键状态：

| 属性/方法        | 说明                                        |
| ---------------- | ------------------------------------------- |
| `token`          | 当前 Access Token                           |
| `userInfo`       | 当前用户信息（id、name、roles、buttons 等） |
| `isLogin`        | 是否已登录（基于 token 是否存在判断）       |
| `isStaticSuper`  | 静态路由模式下是否为超级角色                |
| `login()`        | 执行登录                                    |
| `resetStore()`   | 重置认证状态（登出）                        |
| `initUserInfo()` | 初始化用户信息（页面刷新时调用）            |

### 路由守卫

路由守卫定义在 `src/router/guard/route.ts`，在每次路由跳转前执行认证和权限校验：

```
路由跳转触发
  → initRoute()          初始化路由（首次访问时）
    → 检查 token 是否存在
      → 无 token：跳转登录页（常量路由除外）
      → 有 token：初始化权限路由 (initAuthRoute)
  → 权限校验
    → 已登录访问登录页：重定向到首页
    → 无需登录的页面：直接放行
    → 未登录：重定向到登录页（携带 redirect 参数）
    → 已登录但无权限：跳转 403 页面
    → 正常放行
```

关键逻辑：

```typescript
const isLogin = Boolean(localStg.get("token"))
const needLogin = !to.meta.constant
const routeRoles = to.meta.roles || []

const hasRole = authStore.userInfo.roles.some((role) => routeRoles.includes(role))
const hasAuth = authStore.isStaticSuper || !routeRoles.length || hasRole
```

:::info
路由分为两类：**常量路由**（`meta.constant = true`）无需登录即可访问，如登录页、404 页面；**权限路由**需要登录且满足角色要求才可访问。
:::

### Token 自动刷新

当 API 请求返回 Token 过期码（`9999`/`9998`/`3333`）时，前端自动使用 Refresh Token 换取新的 Token 对，并重试原请求：

```typescript
async function handleRefreshToken() {
  const rToken = localStg.get("refreshToken") || ""
  const { error, data } = await fetchRefreshToken(rToken)
  if (!error) {
    localStg.set("token", data.accessToken)
    localStg.set("refreshToken", data.refreshToken)
    return true
  }
  resetStore() // 刷新失败则登出
  return false
}
```

刷新机制使用 Promise 共享模式：多个并发请求同时触发过期时，只发起一次刷新请求，所有请求等待同一个 Promise 结果后统一重试。

### 登出

登出通过 `resetStore()` 方法实现：

1. 记录当前用户 ID（用于下次登录时比对是否切换用户）
2. 清除 localStorage 中的 Token
3. 重置 auth store 状态
4. 跳转到登录页面
5. 清理标签页缓存和路由状态
