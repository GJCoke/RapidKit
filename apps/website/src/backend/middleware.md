# 中间件

本项目基于 FastAPI/Starlette 的中间件机制，在请求/响应生命周期中注入日志记录、CORS、上下文管理、国际化、限流和客户端状态等横切关注点。

## 注册与执行顺序

FastAPI 中间件采用 **LIFO（先进后出）** 的注册机制 -- 最先注册的中间件最后执行（最内层），最后注册的中间件最先执行（最外层）。请求从外层向内层穿透，响应从内层向外层返回。

`apps/backend/src/main.py` 的 `setup_middlewares` 先挂载插件中间件，再按以下顺序注册全局中间件（CORS 参数见下文）：

```python
def setup_middlewares(app: FastAPI) -> None:
    mount_plugin_middlewares(app, getattr(app.state, "plugins", []))

    app.add_middleware(StateMiddleware)
    app.add_middleware(AuditMiddleware)
    app.add_middleware(MetricsMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(I18nMiddleware)
    app.add_middleware(LoggerMiddleware)
    app.add_middleware(ContextMiddleware, plugins=(NanoIdPlugin(),))
    app.add_middleware(CORSMiddleware, ...)
    app.add_middleware(SecurityMiddleware)
    app.add_middleware(PrometheusMiddleware, metrics=app.state.prometheus)
```

应用中间件的请求执行顺序如下，响应按相反方向返回：

| 注册顺序 | 中间件                           | 请求执行顺序       |
| -------- | -------------------------------- | ------------------ |
| 插件     | 插件中间件（`order` 越小越靠外） | 所有全局中间件内侧 |
| 1        | StateMiddleware                  | 10（全局最内层）   |
| 2        | AuditMiddleware                  | 9                  |
| 3        | MetricsMiddleware                | 8                  |
| 4        | RateLimitMiddleware              | 7                  |
| 5        | I18nMiddleware                   | 6                  |
| 6        | LoggerMiddleware                 | 5                  |
| 7        | ContextMiddleware                | 4                  |
| 8        | CORSMiddleware                   | 3                  |
| 9        | SecurityMiddleware               | 2                  |
| 10       | PrometheusMiddleware             | 1（全局最外层）    |

这里的“最外层”和“最内层”指应用注册的中间件。Starlette 还会在外侧添加 `ServerErrorMiddleware`，在内侧添加 `ExceptionMiddleware`。未处理异常由外侧错误处理器生成响应时，应用的统一异常处理器会补齐安全响应头。

:::tip
注册顺序与请求执行顺序相反。`PrometheusMiddleware` 最后注册，因此能统计安全校验、CORS、上下文校验和限流提前返回的请求；`LoggerMiddleware` 只记录到达其内层的请求。
:::

## LoggerMiddleware

位于 `ContextMiddleware` 内层、`I18nMiddleware` 外层，记录到达这一层的请求访问日志，包括客户端地址、请求方法、路径、响应状态码和耗时。外层安全校验、CORS 或上下文校验提前返回的请求不会经过它。

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

## RateLimitMiddleware

基于 `limits` 的异步 Redis 存储实现速率限制。当请求超出限流阈值时，返回 `TOO_MANY_REQUESTS`（状态码 1006）的统一响应格式，而非标准的 HTTP 429。

```python
class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if is_internal_path(request.url.path):
            return await call_next(request)
        provider = getattr(request.app.state, "rate_limit_rules", None)
        if provider is not None:
            rules = await provider(request)
        else:
            ip = request.client.host if request.client else "unknown"
            rules = [("default", f"ip:{ip}", settings.RATE_LIMIT_ANONYMOUS)]
        retry_after = await request.app.state.limiter.check(rules)
        if retry_after is not None:
            return JSONResponse(
                AppException(StatusCode.TOO_MANY_REQUESTS).dump(),
                headers={"Retry-After": str(retry_after)},
            )
        return await call_next(request)
```

默认限流使用异步 Redis 存储，多个 API 副本共享额度。通过签名和有效期检查的令牌按用户 `sub` 计数，其他请求按可信客户端 IP 计数；身份解析不查询 Redis。
认证插件通过自身的启动回调安装敏感入口策略；未启用认证插件时使用匿名 IP 默认额度，应用主入口不导入认证业务代码。

- `RATE_LIMIT_AUTHENTICATED=600/minute`：已登录用户。
- `RATE_LIMIT_ANONYMOUS=120/minute`：匿名 IP。
- 登录叠加 IP + 原始用户名 `10/minute` 和 IP 总量 `200/minute`。
- 密码重置申请叠加 IP + 规范化邮箱 `5/minute` 和 IP 总量 `60/minute`。
- 刷新令牌按已验签的 refresh `sub` 计 `30/minute`；邀请与密码设置入口共享 IP `30/minute`。

敏感额度对应 `RATE_LIMIT_LOGIN_ACCOUNT`、`RATE_LIMIT_LOGIN_IP`、`RATE_LIMIT_RESET_ACCOUNT`、`RATE_LIMIT_RESET_IP`、`RATE_LIMIT_REFRESH` 和 `RATE_LIMIT_CREDENTIAL_SETUP`，均可通过环境变量覆盖。默认额度跨路由累计，不按 URL 拆分。健康检查和 `/metrics` 跳过限流；超限保持 HTTP 200、业务码 `1006`，并带正整数 `Retry-After` 头。

## StateMiddleware

位于全局中间件最内层、插件中间件外侧，负责从请求中提取客户端信息并写入上下文，包括：

- **IP 地址**：通过 `get_client_ip()` 读取 ASGI 客户端地址；代理头由 Uvicorn 按可信网段处理
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
`StateMiddleware` 依赖 `ContextMiddleware` 提供的请求上下文（`ctx`），因此必须在 `ContextMiddleware` 之前注册（请求阶段在其内层执行）。调整中间件注册顺序时需注意这一依赖关系。
:::

## MetricsMiddleware

负责采集处理耗时、状态码等业务指标，供 monitoring 插件聚合分析。位于 `RateLimitMiddleware` 内层、`AuditMiddleware` 外层，因此限流提前返回的请求不计入这组业务指标。

## AuditMiddleware

位于 `MetricsMiddleware` 内层、`StateMiddleware` 外层，在下游执行后读取身份和业务结果，记录审计事件。限流等外层中间件提前返回的请求不会进入这一层。

## SecurityMiddleware

位于 `CORSMiddleware` 外层、`PrometheusMiddleware` 内层，检查请求体大小并添加安全响应头，因此 CORS 预检和提前返回的响应也带有安全头。自身拒绝请求时仍能由外层 Prometheus 统计。

## PrometheusMiddleware

位于全局中间件最外层，独立于 monitoring 业务指标，统计请求数、延迟和在途请求。按路由模板及业务结果标记指标，覆盖内层提前返回的错误；健康检查和 `/metrics` 不计入这组指标。

## 插件中间件

插件可通过 `PluginManifest.middlewares` 声明自定义中间件，框架根据 `order` 值排序后统一挂载。详见 [插件系统 - 中间件](./plugin-system.md#中间件)。
