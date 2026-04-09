# 中间件

本项目基于 FastAPI/Starlette 的中间件机制，在请求/响应生命周期中注入日志记录、CORS、上下文管理、国际化、限流和客户端状态等横切关注点。

## 注册与执行顺序

FastAPI 中间件采用 **LIFO（先进后出）** 的注册机制 -- 最先注册的中间件最后执行（最内层），最后注册的中间件最先执行（最外层）。请求从外层向内层穿透，响应从内层向外层返回。

`setup_middlewares` 中的注册代码如下：

```python
def setup_middlewares(app: FastAPI) -> None:
    app.add_middleware(StateMiddleware)        # 注册 1 -> 执行 6（最内层）
    app.add_middleware(SlowAPIMiddleware)      # 注册 2 -> 执行 5
    app.add_middleware(I18nMiddleware)         # 注册 3 -> 执行 4
    app.add_middleware(ContextMiddleware, plugins=(NanoIdPlugin(),))  # 注册 4 -> 执行 3
    app.add_middleware(CORSMiddleware, ...)    # 注册 5 -> 执行 2
    app.add_middleware(LoggerMiddleware)       # 注册 6 -> 执行 1（最外层）
```

完整的执行顺序如下表所示：

| 注册顺序 | 中间件            | 请求执行顺序 |
| -------- | ----------------- | ------------ |
| 1        | StateMiddleware   | 6 (最内层)   |
| 2        | SlowAPIMiddleware | 5            |
| 3        | I18nMiddleware    | 4            |
| 4        | ContextMiddleware | 3            |
| 5        | CORSMiddleware    | 2            |
| 6        | LoggerMiddleware  | 1 (最外层)   |

:::tip
理解 LIFO 顺序是调试中间件问题的关键。例如 `LoggerMiddleware` 虽然最后注册，但它在最外层运行，因此能够记录完整的请求/响应周期耗时。
:::

## LoggerMiddleware

位于最外层，负责记录每个 HTTP 请求的访问日志，包括客户端地址、请求方法、路径、HTTP 版本、响应状态码和耗时。

```python
class LoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, callback):
        before = time.time()
        response = await callback(request)
        duration = round((time.time() - before) * 1000)
        logger.info(
            '%s - "%s %s HTTP/%s" %d %dms',
            get_client_addr(request.client),
            request.method, request.url.path,
            request.scope.get("http_version"),
            response.status_code, duration,
        )
        return response
```

## CORSMiddleware

使用 FastAPI 内置的 `CORSMiddleware`，配置项全部从环境变量读取：

| 环境变量             | 说明               |
| -------------------- | ------------------ |
| `CORS_ORIGINS`       | 允许的源列表       |
| `CORS_ORIGINS_REGEX` | 允许的源正则表达式 |
| `CORS_HEADERS`       | 允许的请求头列表   |

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGINS_REGEX,
    allow_credentials=True,
    allow_methods=("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"),
    allow_headers=settings.CORS_HEADERS,
)
```

## ContextMiddleware

基于 `starlette-context` 扩展，为每个请求创建独立的上下文空间。通过 `NanoIdPlugin` 插件为请求生成唯一的 Nano ID，用于日志中的请求追踪。

当上下文校验失败时，返回国际化的 `BAD_REQUEST` 错误响应：

```python
class ContextMiddleware(StarletteContextMiddleware):
    async def dispatch(self, request, call_next):
        try:
            context = await self.set_context(request)
        except MiddleWareValidationError:
            error = AppException(StatusCode.BAD_REQUEST)
            language = resolve_language(request.headers.get("accept-language"), languages)
            return Response(json.dumps({
                "code": error.code,
                "message": t(str(StatusCode.BAD_REQUEST), language),
                "data": error.data,
            }, ensure_ascii=False), media_type="application/json")

        with request_cycle_context(context):
            response = await call_next(request)
            for plugin in self.plugins:
                await plugin.enrich_response(response)
            return response
```

## I18nMiddleware

解析请求头中的 `Accept-Language`，设置当前请求的语言环境。支持 `zh-CN` 和 `en-US` 两种语言，匹配逻辑按权重排序并优先精确匹配。

```python
class I18nMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, callback):
        language = resolve_language(request.headers.get("accept-language"), languages)
        if language and i18n.current_language != language:
            i18n.current_language = language
        response = await callback(request)
        return response
```

## SlowAPIMiddleware

基于 SlowAPI 实现的速率限制中间件。当请求超出限流阈值时，返回 `TOO_MANY_REQUESTS`（状态码 1006）的统一响应格式，而非标准的 HTTP 429。

```python
class SlowAPIMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        limiter = request.app.state.limiter
        if not limiter.enabled:
            return await call_next(request)
        # ... 限流检查
        if error_response is not None:
            return Response(json.dumps(
                AppException(StatusCode.TOO_MANY_REQUESTS).dump(),
                ensure_ascii=False,
            ), media_type="application/json")
        response = await call_next(request)
        return response
```

默认限流规则通过 `DEFAULT_LIMITS` 环境变量配置，默认值为 `20/minute`。

## StateMiddleware

位于最内层，负责从请求中提取客户端信息并写入上下文，包括：

- **IP 地址**：通过 `get_client_ip()` 提取，支持代理头解析
- **User-Agent 信息**：通过 `parse_user_agent()` 解析为 `user_agent`、`os`、`browser`、`device` 四个字段

```python
class StateMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, callback):
        ip_info = get_client_ip(request)
        if ip_info:
            ctx.ip = ip_info

        ua_info = parse_user_agent(request)
        if ua_info:
            ctx.user_agent = ua_info.user_agent
            ctx.os = ua_info.os
            ctx.browser = ua_info.browser
            ctx.device = ua_info.device

        response = await callback(request)
        return response
```

:::warning
`StateMiddleware` 依赖 `ContextMiddleware` 提供的请求上下文（`ctx`），因此必须在 `ContextMiddleware` 之后注册（即在更内层执行）。调整中间件注册顺序时需注意这一依赖关系。
:::
