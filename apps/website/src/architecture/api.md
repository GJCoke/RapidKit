# 前后端通信

## API 约定

所有 REST API 端点统一注册在 `/api/v1/` 前缀下，遵循 RESTful 语义：

| HTTP 方法 | 语义                | 示例                             |
| --------- | ------------------- | -------------------------------- |
| GET       | 查询资源            | `GET /api/v1/roles`              |
| POST      | 创建资源 / 复杂查询 | `POST /api/v1/auth/login`        |
| PUT       | 更新资源            | `PUT /api/v1/roles/{role_id}`    |
| PATCH     | 部分更新            | `PATCH /api/v1/users/{user_id}`  |
| DELETE    | 删除资源            | `DELETE /api/v1/users/{user_id}` |

后端路由注册在 `src/main.py` 的 `setup_router` 函数中，按业务域组织：

```python
v1_router = APIRouter(prefix=settings.API_PREFIX_V1)  # /api/v1
v1_router.include_router(auth.router)       # 认证
v1_router.include_router(router.router)     # 路由管理
v1_router.include_router(roles.router)      # 角色管理
v1_router.include_router(manage.router)     # 菜单管理
v1_router.include_router(user.router)       # 用户管理
v1_router.include_router(script.router)     # 脚本管理
```

## 统一响应结构

所有 API 响应均返回 HTTP 200，业务状态通过响应体中的 `code` 字段区分。统一响应结构定义在 `src/common/schemas/response.py`：

```python
class Response(BaseResponse, Generic[T]):
    code: int = Field(int(StatusCode.SUCCESS), description="状态码。")
    message: str = Field("common.response.success", description="响应消息。")
    data: T | None = Field(None, description="响应数据。")
```

实际响应示例：

```json
{
  "code": 0,
  "message": "Successful.",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "admin",
    "email": "admin@example.com"
  }
}
```

:::info
`code: 0` 表示业务成功（对应环境变量 `VITE_SERVICE_SUCCESS_CODE=0`）。非零 code 表示业务异常，前端根据不同的 code
值执行对应的错误处理逻辑。
:::

## camelCase 自动转换

后端 Python 使用 snake_case 命名，前端 JavaScript 使用 camelCase 命名。项目通过 Pydantic 的 alias generator
实现自动转换，所有请求和响应的 JSON 字段均为 camelCase 格式。

基础模型定义在 `src/common/schemas/base.py`：

```python
from pydantic import AliasGenerator, ConfigDict
from pydantic.alias_generators import to_camel

class BaseModel(_BaseModel):
    model_config = ConfigDict(
        alias_generator=AliasGenerator(alias=to_camel),
        populate_by_name=True,
    )
```

效果：模型中的 `page_size` 字段在 JSON 中自动序列化为 `pageSize`，同时也接受 `pageSize` 作为输入。前端无需关心后端的命名风格，始终使用
camelCase 即可。

## 分页模式

分页请求和响应有统一的数据结构。

请求参数（`PaginatedRequest`）：

```json
{
  "page": 1,
  "pageSize": 10
}
```

响应结构（`PaginatedResponse`）：

```json
{
  "code": 0,
  "message": "Successful.",
  "data": {
    "page": 1,
    "pageSize": 10,
    "total": 100,
    "records": [...]
  }
}
```

后端模型定义：

```python
class PaginatedRequest(BaseRequest):
    page: int = Field(1, description="当前页码。")
    page_size: int = Field(10, description="每页条数。")

class PaginatedResponse(BaseResponse, Generic[T]):
    page: int = Field(..., description="页码。")
    page_size: int = Field(..., description="每页条数。")
    total: int = Field(..., description="总条数。")
    records: list[T] = Field(..., description="记录列表。")
```

## OpenAPI 类型生成

后端基于 FastAPI 自动生成 OpenAPI 文档（开发环境下访问 `/openapi.json`），前端通过 `openapi-typescript` 工具将 OpenAPI
schema 转换为 TypeScript 类型定义，实现全链路类型安全。

### 生成流程

1. 后端启动后，FastAPI 在 `/openapi.json` 提供 OpenAPI 3.0 规范文档
2. 前端 Vite 插件 `generateOpenapiTypesPlugin` 在开发服务启动时自动拉取并生成类型文件 `src/typings/schema.d.ts`
3. 热更新时通过 SHA256 哈希比对，仅当 schema 变更时重新生成

### 类型工具

基于生成的 `schema.d.ts`，项目封装了两个核心类型工具：

- **`Service.ApiRequest<Path, Method, ParamType>`**：推导请求参数类型，`ParamType` 可选 `path` / `query` / `body`
- **`Service.ApiResponse<Path, Method>`**：推导响应数据类型，自动提取 `data` 字段

### 业务类型封装

在全局命名空间 `Api` 下按业务模块封装类型：

```typescript
declare global {
  namespace Api {
    namespace Auth {
      type LoginBody = Service.ApiRequest<"/api/v1/auth/login", "post", "body">
      type LoginToken = Service.ApiResponse<"/api/v1/auth/login", "post">
      type UserInfo = Service.ApiResponse<"/api/v1/auth/user/info">
    }
  }
}
```

业务代码中直接使用：

```typescript
export function fetchLogin(data: Api.Auth.LoginBody) {
  return request<Api.Auth.LoginToken>({
    url: "/auth/login",
    method: "POST",
    data,
  })
}
```

:::tip
详细的 OpenAPI 类型生成方案说明请参考 [OpenAPI 类型生成](../guide/openapi-types.md)。
:::

## 前端 HTTP 客户端

前端 HTTP 客户端基于 `@rapidkit/axios` 封装，在 `src/service/request/index.ts` 中配置。核心机制包括：

### 请求拦截

每个请求自动注入 Authorization 头和语言标识：

```typescript
async onRequest(config) {
  const Authorization = getAuthorization()   // Bearer <token>
  const language = localStg.get("lang") || "zh-CN"
  Object.assign(config.headers, { Authorization, "Accept-Language": language })
  return config
}
```

### 响应成功判断

通过响应体中的 `code` 字段判断业务是否成功：

```typescript
isBackendSuccess(response) {
  return String(response.data.code) === import.meta.env.VITE_SERVICE_SUCCESS_CODE
}
```

### 错误处理

前端根据后端返回的不同 `code` 值执行对应操作：

| 错误码分类   | 环境变量                           | 默认值           | 行为                         |
| ------------ | ---------------------------------- | ---------------- | ---------------------------- |
| 登出码       | `VITE_SERVICE_LOGOUT_CODES`        | `401`            | 直接清除登录状态，跳转登录页 |
| 弹窗登出码   | `VITE_SERVICE_MODAL_LOGOUT_CODES`  | `7777,7778`      | 弹出确认对话框后登出         |
| Token 过期码 | `VITE_SERVICE_EXPIRED_TOKEN_CODES` | `9999,9998,3333` | 自动刷新 Token 并重试请求    |

### Token 自动刷新

当收到 Token 过期码时，前端自动使用 Refresh Token 换取新的 Token 对：

```typescript
const expiredTokenCodes = import.meta.env.VITE_SERVICE_EXPIRED_TOKEN_CODES?.split(",") || []
if (expiredTokenCodes.includes(responseCode)) {
  const success = await handleExpiredRequest(request.state)
  if (success) {
    const Authorization = getAuthorization()
    Object.assign(response.config.headers, { Authorization })
    return instance.request(response.config) // 用新 Token 重试原请求
  }
}
```

:::warning
Token 刷新过程使用 Promise 共享机制，多个并发请求同时触发刷新时，只会发起一次刷新请求，所有请求共享同一个刷新结果，避免重复刷新导致
Refresh Token 失效。
:::
