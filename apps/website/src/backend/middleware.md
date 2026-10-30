# 中间件

生产请求的最外层是纯 ASGI `LoggerMiddleware`，运行入口为 `src.main:asgi_app`。`src.main.app` 仍是原 FastAPI 对象，用于路由、state、依赖覆盖和应用内省。只把日志类放到 `add_middleware` 列表最外侧，无法观察 FastAPI 在用户中间件之外生成的最终异常响应。

## 请求顺序

请求大致按以下顺序进入，响应反向返回：

```text
LoggerMiddleware（请求 ID、完成日志、Prometheus 和 Redis 请求统计）
  FastAPI ServerErrorMiddleware（未捕获异常的最终响应）
    SecurityMiddleware
      CORSMiddleware
        ContextMiddleware
          I18nMiddleware
            RateLimitMiddleware
              AuditMiddleware
                StateMiddleware
                  插件中间件
                    框架异常处理与路由
```

全局中间件在 `main.setup_middlewares()` 注册，注册规则为后注册先执行。插件中间件先注册，位于全局基础设施层内侧。生产不再注册第二份 MetricsMiddleware 或内层 LoggerMiddleware，避免同一请求重复计数或只计到响应头。

## LoggerMiddleware

观察 ASGI receive/send 和共享请求状态，不缓存请求/响应正文。入口建立规范 request ID，响应开始时写入一次 `X-Request-ID`；即使安全检查、非法 ID 或限流提前返回，也保留完成记录。

日志同时描述实际 HTTP 状态、业务结果、完整响应是否发送和处理是否异常。流式响应、发送失败、取消和响应后后台失败分别处理，异常继续传播。请求计数和耗时只有一个所有者，并由它驱动 Prometheus 与 Redis 看板统计。详细字段与安全规则见[日志系统](./logging)。

## SecurityMiddleware

位于所有读 body 的中间件之前，对 Content-Length、冲突长度和流式 body 实施大小限制，并补安全响应头。拒绝时写入业务码和固定分类，外层日志仍能观察；不会为记录日志把整个 body 缓存下来。

Nginx 的 body 限制发生在应用之前：由网关记录拒绝原因和 edge ID，不能要求应用记录一个从未到达它的请求。

## CORS 与 ContextMiddleware

CORS 可以提前处理预检请求，仍处于外层生命周期观察器内。ContextMiddleware 建立 starlette-context、可信身份及 Sentry 隔离作用域，使用入口生成的同一个 NanoID。非法 ID 继续按既有错误协议返回，不能为打日志放宽校验。

身份和业务结果通过共享请求状态传递，不能指望下游 asyncio task 修改 ContextVar 后自动传播回父任务。作用域退出后恢复原值，防止并发用户串线。

## I18nMiddleware

解析 Accept-Language 并使用项目已有国际化机制生成业务消息。日志以业务码、路由和分类关联，不依赖翻译后的自由文本判断成功或失败。

## RateLimitMiddleware

在业务 dispatch 前等待共享限流计数。返回 Retry-After、非零业务码和 `rate_limited` 分类；不依赖 HTTP 429 识别失败。登录、刷新、密码重置及凭证校验使用 auth 插件声明的附加限额，POST 校验与过渡期 GET 使用相同规则。

## AuditMiddleware

仅记录已纳入审计的变更操作和声明，HTTP 运行日志覆盖其他请求。它位于限流内侧，因此外层提前拒绝不等于存在审计记录。业务结果标记独立于 AUDIT_ENABLED，关闭审计仍不能影响错误统计。

审计复用可信 actor/subject、资源、结果和字段白名单。它不承担保存密码、token 或完整请求/响应的职责，也不能替代请求完成日志。

## StateMiddleware

解析客户端 IP 和 User-Agent，补充请求上下文。缺少可选客户端信息不是业务故障，不逐请求刷 INFO。日志记录身份时只读取已加载的可信标量，不触发过期 ORM 对象的延迟加载。

## 测试和嵌入

保持 FastAPI 对象供 state/依赖覆盖使用；管理 lifespan 时把实际观察边界也包进去，再使用 lifespan manager 返回的 ASGI 应用发 HTTP 请求。否则测试可能绕过生产边界，或由 lifespan state 注入覆盖了请求状态。

`PrometheusMiddleware` 保留为嵌入场景的兼容入口，复用同一生命周期实现；不要与生产最外层观察器重复注册。健康检查和 /metrics 成功请求不计入业务流量，也不逐条输出 INFO。
