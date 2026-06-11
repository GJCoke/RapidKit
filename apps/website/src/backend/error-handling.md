# 错误处理与状态码

本项目采用统一的错误处理机制：所有 API 响应均返回 HTTP 200，通过 6 位业务状态码区分成功与失败，配合国际化消息实现友好的错误提示。

## 统一响应格式

无论请求成功还是失败，所有接口都返回 HTTP 200 状态码，使用统一的 JSON 信封结构：

```json
{
  "code": 0,
  "message": "请求成功",
  "data": null
}
```

| 字段      | 类型     | 说明                             |
| --------- | -------- | -------------------------------- |
| `code`    | `int`    | 6 位业务状态码，`0` 表示成功     |
| `message` | `string` | 经过 i18n 翻译的提示信息         |
| `data`    | `any`    | 响应数据，失败时可能包含错误详情 |

:::info
这种设计使得前端可以统一处理响应结构，避免根据 HTTP 状态码做分支判断。业务错误与系统错误通过 `code` 字段区分。
:::

## 6 位状态码体系

状态码采用 `[插件(2位)][错误类型(1位)][序号(3位)]` 格式：

```text
  14 001
  ││ │
  ││ └── 序号 (001-999)
  │└──── 错误类型 (0-8)
  └───── 插件段 (00-99)
```

### 插件段分配

| 插件段 | 插件     | 说明                 |
| ------ | -------- | -------------------- |
| `00`   | 框架通用 | 全局共用的基础错误码 |
| `01`   | Auth     | 认证、角色、菜单管理 |
| `04`   | Worker   | Celery 任务队列管理  |

:::tip
新增插件时，选择一个未使用的 2 位数字作为插件段，在插件内的 `status_codes.py` 中定义。建议按注册顺序递增分配。
:::

### 错误类型划分

| 类型位 | 类别                | 说明                           |
| ------ | ------------------- | ------------------------------ |
| 0      | 成功                | 请求成功                       |
| 1      | 参数/请求错误       | 验证失败、格式错误、限流等     |
| 2      | 业务错误            | 用户、角色、菜单等业务逻辑错误 |
| 3      | 状态/并发/幂等      | 资源冲突、重复请求等           |
| 4      | 权限/安全           | 认证失败、权限不足等           |
| 5      | 资源不存在          | 用户/角色/菜单/Worker 不存在   |
| 6      | 第三方/依赖错误     | 外部服务调用失败               |
| 7      | 系统错误            | 数据库、服务器等系统级错误     |
| 8      | Socket/实时通信错误 | WebSocket 连接、消息传输等     |

### 编码示例

| 完整码  | 拆解     | 含义                      |
| ------- | -------- | ------------------------- |
| `0`     | 成功     | 请求成功                  |
| `1001`  | 00-1-001 | 框架参数验证错误          |
| `14001` | 01-4-001 | Auth 插件认证失败         |
| `14002` | 01-4-002 | Auth 插件 Token 过期      |
| `42001` | 04-2-001 | Worker 插件任务触发失败   |
| `45001` | 04-5-001 | Worker 插件 Worker 不存在 |

## BaseStatusCode 基类

所有状态码枚举（框架级和插件级）均继承 `BaseStatusCode`：

```python
from enum import Enum


class BaseStatusCode(Enum):
    """所有状态码枚举的基类。"""

    def __init__(self, code: int, description: str) -> None:
        self.code = code
        self.description = description

    @property
    def plugin_id(self) -> int:
        """插件段 (前 2 位)。"""
        return self.code // 10000

    @property
    def type(self) -> int:
        """错误类型段 (第 3 位)。"""
        return (self.code % 10000) // 1000

    @property
    def sequence(self) -> int:
        """序号段 (后 3 位)。"""
        return self.code % 1000
```

:::info
`description` 字段存储 i18n 翻译键（如 `"auth.error.tokenExpired"`），由 `AppException` 自动翻译为用户语言。
:::

## 框架通用状态码 (StatusCode)

框架通用码定义在 `packages/framework/` 中，插件段为 `00`：

```python
from rapidkit_framework.status_codes import BaseStatusCode


class StatusCode(BaseStatusCode):
    """框架通用错误码 (plugin_id=00)。"""

    SUCCESS = (0, "common.error.success")

    # 参数错误 (001xxx)
    VALIDATION_ERROR = (1001, "common.error.validationError")
    INVALID_INPUT = (1002, "common.error.invalidInput")
    MISSING_REQUIRED_FIELD = (1003, "common.error.missingRequiredField")
    INVALID_FORMAT = (1004, "common.error.invalidFormat")
    BAD_REQUEST = (1005, "common.error.badRequest")
    TOO_MANY_REQUESTS = (1006, "common.error.tooManyRequests")

    # 状态冲突 (003xxx)
    ALREADY_EXISTS = (3001, "common.error.alreadyExists")
    DUPLICATE_REQUEST = (3002, "common.error.duplicateRequest")
    STATE_CONFLICT = (3003, "common.error.stateConflict")
    CONCURRENT_MODIFICATION = (3004, "common.error.concurrentModification")

    # 资源不存在 (005xxx)
    RESOURCE_NOT_FOUND = (5001, "common.error.resourceNotFound")

    # 第三方错误 (006xxx)
    EXTERNAL_SERVICE_ERROR = (6001, "common.error.externalServiceError")
    THIRD_PARTY_ERROR = (6002, "common.error.thirdPartyError")
    DEPENDENCY_ERROR = (6003, "common.error.dependencyError")

    # 系统错误 (007xxx)
    INTERNAL_SERVER_ERROR = (7001, "common.error.internalServerError")
    DATABASE_ERROR = (7002, "common.error.databaseError")
    SYSTEM_BUSY = (7003, "common.error.systemBusy")

    # Socket 错误 (008xxx)
    SOCKET_CONNECTION_ERROR = (8001, "common.error.socketConnectionError")
    SOCKET_CONNECTION_CLOSED = (8002, "common.error.socketConnectionClosed")
    SOCKET_MESSAGE_SEND_ERROR = (8003, "common.error.socketMessageSendError")
    SOCKET_INVALID_MESSAGE = (8004, "common.error.socketInvalidMessage")
    SOCKET_AUTHENTICATION_FAILED = (8005, "common.error.socketAuthenticationFailed")
    SOCKET_NAMESPACE_NOT_FOUND = (8006, "common.error.socketNamespaceNotFound")
```

## 插件状态码

每个插件在自己的 `status_codes.py` 中定义专属错误码枚举，继承 `BaseStatusCode`。

### Auth 插件 (plugin_id=01)

```python
from rapidkit_framework.status_codes import BaseStatusCode


class AuthStatusCode(BaseStatusCode):
    """Auth 插件错误码。"""

    # 业务错误 (012xxx)
    DEPARTMENT_HAS_CHILDREN = (12001, "auth.error.departmentHasChildren")
    USER_OPERATION_ERROR = (12002, "auth.error.userOperationError")
    ROLE_OPERATION_ERROR = (12003, "auth.error.roleOperationError")
    PERMISSION_OPERATION_ERROR = (12004, "auth.error.permissionOperationError")
    INVALID_OPERATION = (12005, "auth.error.invalidOperation")

    # 权限/安全错误 (014xxx)
    AUTHENTICATION_FAILED = (14001, "auth.error.authenticationFailed")
    TOKEN_EXPIRED = (14002, "auth.error.tokenExpired")
    TOKEN_INVALID = (14003, "auth.error.tokenInvalid")
    INSUFFICIENT_PERMISSIONS = (14004, "auth.error.insufficientPermissions")
    ROLE_PERMISSION_DENIED = (14005, "auth.error.rolePermissionDenied")
    MENU_PERMISSION_DENIED = (14006, "auth.error.menuPermissionDenied")
    RESOURCE_PERMISSION_DENIED = (14007, "auth.error.resourcePermissionDenied")
    USER_DISABLED = (14008, "auth.error.userDisabled")
    TOKEN_REFRESH_FAILED = (14009, "auth.error.tokenRefreshFailed")
    ACCOUNT_LOCKED = (14010, "auth.error.accountLocked")

    # 资源不存在 (015xxx)
    USER_NOT_FOUND = (15001, "auth.error.userNotFound")
    ROLE_NOT_FOUND = (15002, "auth.error.roleNotFound")
    MENU_NOT_FOUND = (15003, "auth.error.menuNotFound")
    MENU_INVALID_PARENT = (15004, "auth.error.menuInvalidParent")
```

### Worker 插件 (plugin_id=04)

```python
from rapidkit_framework.status_codes import BaseStatusCode


class WorkerStatusCode(BaseStatusCode):
    """Worker 插件错误码。"""

    # 业务错误 (042xxx)
    TASK_TRIGGER_FAILED = (42001, "worker.error.taskTriggerFailed")
    TASK_REVOKE_FAILED = (42002, "worker.error.taskRevokeFailed")
    TASK_NOT_REGISTERED = (42003, "worker.error.taskNotRegistered")
    WORKER_CONTROL_FAILED = (42004, "worker.error.workerControlFailed")
    WORKER_OFFLINE = (42005, "worker.error.workerOffline")
    TASK_RETRY_NOT_ALLOWED = (42006, "worker.error.taskRetryNotAllowed")

    # 资源不存在 (045xxx)
    WORKER_NOT_FOUND = (45001, "worker.error.workerNotFound")
    TASK_NOT_FOUND = (45002, "worker.error.taskNotFound")
```

## AppException

`AppException` 是核心业务异常类，接受 `BaseStatusCode` 或整数码，自动通过 i18n 翻译错误消息：

```python
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode

# 使用框架通用码
raise AppException(StatusCode.BAD_REQUEST)

# 使用插件码
from plugin_auth.status_codes import AuthStatusCode

raise AppException(AuthStatusCode.TOKEN_EXPIRED)
```

`AppException` 构造签名：

```python
class AppException(BaseHTTPException):
    def __init__(
        self,
        code: BaseStatusCode | int,
        *,
        message: str | None = None,
        data: Any = None,
        http_status_code: int = status.HTTP_200_OK,
        headers: dict[str, str] | None = None,
    ): ...
```

:::warning
`message` 参数仅用于覆盖自动翻译，不要传入硬编码的用户可见文本。始终通过 StatusCode 的 i18n 键提供多语言支持。
:::

## 异常处理器

在 `setup_exception_handlers` 中注册了 5 个全局异常处理器，所有处理器均返回 HTTP 200：

| 异常类型                 | 处理方式                                            |
| ------------------------ | --------------------------------------------------- |
| `RateLimitExceeded`      | 返回 `TOO_MANY_REQUESTS`（1006）                    |
| `RequestValidationError` | 格式化校验错误详情，返回 `VALIDATION_ERROR`（1001） |
| `AppException`           | 直接使用 `exc.dump()` 序列化                        |
| `HTTPException`          | 将 HTTP 状态码作为 `code`，`detail` 经 i18n 翻译    |
| `Exception`              | 兜底处理，返回 `INTERNAL_SERVER_ERROR`（7001）      |

```python
@app.exception_handler(AppException)
async def handle_app_exception(request, exc):
    logger.warning(
        '"{method} {path}" AppException[{code}]: {message}',
        method=request.method, path=request.url.path,
        code=exc.code, message=exc.message,
    )
    return JSONResponse(status_code=status.HTTP_200_OK, content=exc.dump())
```

:::tip
所有异常处理器都会通过 `logger` 记录警告或错误日志。业务异常记录 `WARNING` 级别，系统异常记录 `ERROR` 级别并附带完整堆栈。
:::

## 新增状态码指南

### 1. 新增框架通用码

在 `packages/framework/src/rapidkit_framework/status_codes.py` 的 `StatusCode` 枚举中添加：

```python
# 在对应类型区间内添加
MY_ERROR = (1007, "common.error.myError")
```

然后在 `apps/backend/src/locales/langs/` 下的 `zh-CN/common.json` 和 `en-US/common.json` 中添加翻译。

### 2. 新增插件码

在插件的 `status_codes.py` 中添加新成员：

```python
# 确保 plugin_id 和 type 位与文件头部注释一致
MY_PLUGIN_ERROR = (PP_T_NNN, "{plugin}.error.myPluginError")
```

然后在 `apps/backend/src/locales/langs/{zh-CN,en-US}/{plugin}.json` 中添加翻译。

### 3. 创建新插件的状态码

```python
"""
MyPlugin status codes (plugin_id=XX).

6-digit format: XXTNNN
- T=2: business errors
- T=4: permission errors
- T=5: resource not found errors
"""

from rapidkit_framework.status_codes import BaseStatusCode


class MyPluginStatusCode(BaseStatusCode):
    """MyPlugin error codes."""

    # Business errors (XX2xxx)
    SOMETHING_FAILED = (XX2001, "my_plugin.error.somethingFailed")
```

:::danger
插件段号一旦分配就不可更改——前端可能基于错误码范围进行判断（如 Token 失效自动跳转登录页）。
:::

## 前端集成

前端通过 `.env` 配置关注特定错误码，实现自动化处理：

```bash
# 需要登出的错误码
VITE_SERVICE_LOGOUT_CODES=14003,14008

# 弹窗提示后登出的错误码
VITE_SERVICE_MODAL_LOGOUT_CODES=14010

# Token 过期自动刷新的错误码
VITE_SERVICE_EXPIRED_TOKEN_CODES=14002
```

前端 HTTP 拦截器匹配这些码后自动执行对应逻辑，无需硬编码条件判断。
