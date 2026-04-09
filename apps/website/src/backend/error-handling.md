# 错误处理与状态码

本项目采用统一的错误处理机制：所有 API 响应均返回 HTTP 200，通过业务状态码区分成功与失败，配合国际化消息实现友好的错误提示。

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
| `code`    | `int`    | 4 位业务状态码，`0` 表示成功     |
| `message` | `string` | 经过 i18n 翻译的提示信息         |
| `data`    | `any`    | 响应数据，失败时可能包含错误详情 |

:::info
这种设计使得前端可以统一处理响应结构，避免根据 HTTP 状态码做分支判断。业务错误与系统错误通过 `code` 字段区分。
:::

## 4 位状态码体系

状态码采用 `[错误类型(1位)][序号(3位)]` 格式，错误类型划分如下：

| 范围 | 类型                | 说明                           |
| ---- | ------------------- | ------------------------------ |
| 0xxx | 成功                | 请求成功                       |
| 1xxx | 参数/请求错误       | 验证失败、格式错误、限流等     |
| 2xxx | 业务错误            | 用户、角色、菜单等业务逻辑错误 |
| 3xxx | 状态/并发/幂等      | 资源冲突、重复请求等           |
| 4xxx | 权限/安全           | 认证失败、权限不足等           |
| 5xxx | 资源不存在          | 用户/角色/菜单/Worker 不存在   |
| 6xxx | 第三方/依赖错误     | 外部服务调用失败               |
| 7xxx | 系统错误            | 数据库、服务器等系统级错误     |
| 8xxx | Socket/实时通信错误 | WebSocket 连接、消息传输等     |

## StatusCode 枚举

`StatusCode` 是一个双值枚举，每个成员包含数字状态码和 i18n 翻译键：

```python
class StatusCode(Enum):
    SUCCESS = (0, "common.response.success")
    VALIDATION_ERROR = (1001, "common.response.validationError")
    BAD_REQUEST = (1005, "common.response.badRequest")
    TOO_MANY_REQUESTS = (1006, "common.response.tooManyRequests")
    AUTHENTICATION_FAILED = (4001, "common.response.authenticationFailed")
    TOKEN_EXPIRED = (4002, "common.response.tokenExpired")
    RESOURCE_NOT_FOUND = (5004, "common.response.resourceNotFound")
    INTERNAL_SERVER_ERROR = (7001, "common.response.internalServerError")

    def __init__(self, code: int, description: str) -> None:
        self.code = code
        self.description = description
```

每个枚举成员提供 `type`（错误类型）和 `sequence`（序号）属性，以及 `type_name` 属性返回中文类型名称。

## AppException

`AppException` 是核心业务异常类，接受 `StatusCode` 枚举，自动通过 i18n 翻译错误消息：

```python
class AppException(BaseHTTPException):
    def __init__(
        self,
        code: StatusCode | int,
        *,
        message: str | None = None,
        data: Any = None,
        http_status_code: int = status.HTTP_200_OK,
        headers: dict[str, str] | None = None,
    ):
        if isinstance(code, StatusCode):
            self.code = code.code
            description = code.description
        elif isinstance(code, int):
            status_code_enum = get_status_code(code)
            self.code = code
            description = get_status_description(code)

        self.message = message or t(description)
        self.data = data
```

使用方式非常简洁：

```python
# 基本用法
raise AppException(StatusCode.BAD_REQUEST)

# 自定义消息
raise AppException(StatusCode.VALIDATION_ERROR, message="邮箱格式不正确")

# 附带数据
raise AppException(StatusCode.VALIDATION_ERROR, data={"field": "email"})
```

`dump()` 方法将异常序列化为统一的响应字典：

```python
def dump(self) -> dict[str, Any]:
    return {"code": self.code, "message": self.message, "data": self.data}
```

## 异常处理器

在 `setup_exception_handlers` 中注册了 5 个全局异常处理器，所有处理器均返回 HTTP 200：

| 异常类型                 | 处理方式                                            |
| ------------------------ | --------------------------------------------------- |
| `RateLimitExceeded`      | 返回 `TOO_MANY_REQUESTS`（1006）                    |
| `RequestValidationError` | 格式化校验错误详情，返回 `VALIDATION_ERROR`（1001） |
| `AppException`           | 直接使用 `exc.dump()` 序列化                        |
| `HTTPException`          | 将 HTTP 状态码作为 `code`，`detail` 经 i18n 翻译    |
| `Exception`              | 兜底处理，返回 `INTERNAL_SERVER_ERROR`（7001）      |

:::warning
`RequestValidationError` 处理器会通过 `format_validation_errors` 将 Pydantic 校验错误格式化为结构化详情，放入 `data` 字段返回。前端可根据这些信息精确定位参数问题。
:::

```python
@app.exception_handler(AppException)
async def handle_app_exception(request, exc):
    logger.warning(
        '"{method} {path}" AppException[{code}]: {message}',
        method=request.method, path=request.url.path,
        code=exc.code, message=exc.message,
    )
    return JSONResponse(status_code=status.HTTP_200_OK, content=exc.dump())

@app.exception_handler(Exception)
async def handle_server_errors(request, exc):
    logger.exception(
        '"{method} {path}" {status_code} ServerException: {detail}',
        method=request.method, path=request.url.path,
        status_code=int(StatusCode.INTERNAL_SERVER_ERROR), detail=str(exc),
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=AppException(StatusCode.INTERNAL_SERVER_ERROR, data=str(exc)).dump(),
    )
```

:::tip
所有异常处理器都会通过 `logger` 记录警告或错误日志，便于问题排查。业务异常记录 `WARNING` 级别，系统异常记录 `ERROR` 级别并附带完整堆栈。
:::
