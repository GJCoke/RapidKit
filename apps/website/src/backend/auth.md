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

权限系统分为四个层级，覆盖前后端完整的访问控制需求：

| 层级     | 字段                    | 说明                     |
| -------- | ----------------------- | ------------------------ |
| 路由权限 | `router_permissions`    | 前端页面路由访问控制     |
| 接口权限 | `interface_permissions` | 后端 API 端点访问控制    |
| 按钮权限 | `button_permissions`    | 前端 UI 按钮显示控制     |
| 数据权限 | `data_scope`            | 行级数据过滤（详见下文） |

角色模型定义（`plugins/auth/src/plugin_auth/role/models.py`）：

```python
class Role(SQLModel, table=True):
    __tablename__ = "auth_roles"

    name: str = Field(..., unique=True, min_length=2, max_length=100, description="角色名称")
    description: str | None = Field(None, max_length=500, description="角色描述")
    code: str = Field(..., unique=True, min_length=5, max_length=100, description="角色编码")
    status: Status = Field(Status.ON, description="角色状态")
    interface_permissions: list[str] = Field([], sa_column=Column(JSON), description="接口权限编码列表")
    button_permissions: list[str] = Field([], sa_column=Column(JSON), description="按钮权限编码列表")
    router_permissions: list[str] = Field([], sa_column=Column(JSON), description="路由权限编码列表")

    # 数据级权限
    data_scope: int = Field(default=DataScope.SELF, description="数据范围")
    custom_dept_ids: list[UUID] = Field(default_factory=list, sa_column=Column(JSON), description="自定义部门列表")
    data_rule_ids: list[UUID] = Field(default_factory=list, sa_column=Column(JSON), description="数据规则 ID 列表")
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

## 权限缓存结构

`UserPermissionCache` 缓存在 Redis 中，包含接口权限、按钮权限和数据范围信息：

```python
class UserPermissionCache(BaseModel):
    permissions: list[str] = []        # 接口权限列表
    buttons: list[str] = []            # 按钮权限列表
    data_scope: int = DataScope.SELF   # 聚合后的数据范围
    custom_dept_ids: list[UUID] = []   # 自定义部门 ID 列表
    data_rule_ids: list[UUID] = []     # 数据规则 ID 列表
```

## 用户信息缓存

`get_current_user_form_db` 依赖使用 Redis 缓存避免每次请求都查库：

| 配置项    | 值                           |
| --------- | ---------------------------- |
| Redis Key | `auth:user:<{user_id}>`      |
| TTL       | 与 Access Token 过期时间一致 |
| 序列化    | JSON（排除 `password` 字段） |

**读取流程：**

1. 解析 Access Token 获取 `user_id`
2. 查 Redis 缓存 → 命中：反序列化返回
3. 缓存 miss → 查数据库 → 写入 Redis（排除密码）→ 返回

**失效时机：**

- 更新用户信息（`update_user`）
- 删除用户（`delete_user`）
- 批量删除用户（`batch_delete_users`）

:::info
登录流程（`user_login` → `crud.get_by_username()`）不经过此缓存，始终从数据库读取最新数据。
:::

## 数据级权限（DataScope）

在接口权限（控制"能否访问"）之上，系统还提供**数据级权限**（控制"能看到哪些数据"）。通过 `DataScope` 枚举和 `DataPermissionFilter` 依赖实现行级过滤。

### DataScope 枚举

```python
class DataScope(IntEnum):
    ALL = 1               # 全部数据
    SELF = 2              # 仅自己创建的
    DEPT = 3              # 本部门
    DEPT_AND_CHILDREN = 4 # 本部门及下级
    CUSTOM_DEPT = 5       # 自定义部门列表
    CUSTOM_RULE = 6       # 自定义规则
```

角色模型新增字段：

| 字段              | 类型         | 说明                             |
| ----------------- | ------------ | -------------------------------- |
| `data_scope`      | `int`        | 数据范围（DataScope 枚举值）     |
| `custom_dept_ids` | `list[UUID]` | CUSTOM_DEPT 时的自定义部门列表   |
| `data_rule_ids`   | `list[UUID]` | CUSTOM_RULE 时的数据规则 ID 列表 |

### DataPermissionFilter 依赖

`DataPermissionFilter` 是一个可复用的 FastAPI 依赖类，传入目标模型后自动生成 SQLAlchemy WHERE 条件：

```python
from plugin_auth.data_rule.deps import DataPermissionFilter

@router.get("")
async def get_users(
    query: Annotated[UserManagePageQuery, Query(...)],
    user_crud: UserManageCrudDep,
    data_filter: Annotated[ColumnElement[bool], Depends(DataPermissionFilter(User))],
) -> Response[PaginatedResponse[UserManageResponse]]:
    filters = filter_user(query.status, query.keyword)
    users = await user_crud.get_paginate(*filters, data_filter, page=query.page, size=query.page_size)
    return Response(data=users)
```

### 多角色聚合策略

当用户拥有多个角色时，数据范围取最宽（数值最小）：

- 自定义部门列表取并集
- 数据规则 ID 取并集

聚合结果缓存在 `UserPermissionCache` 中，与接口权限共享同一 Redis key。

### DataRule 模型

自定义数据规则存储在 `auth_data_rules` 表中，支持动态条件构建：

```python
class DataRule(SQLModel, table=True):
    __tablename__ = "auth_data_rules"

    name: str          # 规则名称
    model_name: str    # 目标表名
    field: str         # 过滤字段名
    operator: str      # 操作符：eq/ne/gt/ge/lt/le/in/not_in
    value: str         # 值，支持模板变量 ${user_id} ${dept_id}
    logic: str         # 逻辑：AND/OR
```

模板变量在运行时替换为当前用户的实际值。

## 部门管理

系统支持树形部门结构（自引用外键），用于数据级权限的组织架构依据：

```python
class Department(SQLModel, table=True):
    __tablename__ = "auth_departments"

    parent_id: UUID | None  # 父部门 ID（自引用）
    name: str               # 部门名称
    code: str               # 部门编码（唯一）
    sort: int               # 排序
    status: Status          # 状态
    leader_id: UUID | None  # 部门负责人 ID
```

用户通过 `User.department_id` 关联到所属部门。

## 强制重新登录

当用户密码被修改后，系统通过 Redis 标记强制该用户重新登录：

1. 密码修改后，设置 `auth:force_relogin:<user_id>` 标记（TTL 与 Access Token 过期时间一致）
2. 同时清除该用户所有 Refresh Token 和权限缓存
3. 用户下次请求时，`get_current_user_form_db` 检测到标记，抛出 `TOKEN_INVALID` 异常
4. 用户重新登录成功后，删除该标记

```python
# 密码修改后
relogin_key = force_relogin_structure.format(user_id=user_id)
await redis.set(relogin_key, "1", ex=auth_settings.ACCESS_TOKEN_EXP)

# 验证时检查
if await redis.exists(relogin_key):
    raise AppException(StatusCode.TOKEN_INVALID)

# 登录成功后清除
await redis.delete(relogin_key)
```

## 类型协议（UserProtocol）

`rapidkit_common.auth` 定义了 `UserProtocol` 协议类型，提供 `User` 模型的最小接口：

```python
class UserProtocol(Protocol):
    id: UUID
    is_admin: bool
    roles: list[str]
    department_id: UUID | None
```

其他插件通过 `UserDBDep`（类型为 `UserProtocol`）获取当前用户，无需直接依赖 `plugin_auth` 的 `User` 模型。这实现了类型安全的跨插件解耦。

## 依赖注入

项目提供多个认证相关的 FastAPI 依赖项，按需选用：

| 依赖                  | 说明                                                         |
| --------------------- | ------------------------------------------------------------ |
| `UserAccessJWTDep`    | 仅解析 Access Token，返回 JWT payload（不查数据库）          |
| `UserDBDep`           | 解析 Token 后查 Redis/数据库，返回 `UserProtocol` 类型       |
| `UserRefreshDep`      | 校验 Refresh Token（Redis + DB），用于 Token 刷新            |
| `VerifyPermissionDep` | 完整权限校验，含 RBAC 接口权限判断，返回 `UserProtocol` 类型 |
| `AuthCrudDep`         | 注入 `UserCRUD` 实例                                         |

在路由中使用：

```python
from rapidkit_common.auth import UserDBDep, VerifyPermissionDep


# 仅需登录认证
@router.get("/profile")
async def get_profile(user: UserDBDep):
    return user


# 需要接口权限校验
@router.delete("/users/{user_id}")
async def delete_user(user: VerifyPermissionDep, user_id: UUID):
    ...
```
