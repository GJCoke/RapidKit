# 前端日志与本地诊断

Vue 前端使用 `createLogger(scope)` 统一输出控制台日志。
使用现有 logger 无需额外审批。

## 使用方式

```typescript
import { createLogger } from "@/utils/logger"

const logger = createLogger("permission-sync")

logger.debug("Refresh requested", { source: "reconnect" })
logger.info("Permissions refreshed")
logger.warn("Using fallback configuration")
logger.error("Refresh failed", error)
```

`scope` 使用固定的 kebab-case 模块名，不能包含用户输入。
输出示例：`[10:20:30.045] [INFO] [permission-sync] Permissions refreshed`。
时间使用浏览器本地时间，随每次调用更新。
四个级别分别调用 `console.debug/info/warn/error`，可在开发者工具中筛选。
普通对象和普通 `Error` 保留原值，支持对象展开和错误栈查看。

| 级别  | 使用场景                         |
| ----- | -------------------------------- |
| debug | 请求、导航、重连和刷新等过程细节 |
| info  | 已完成的状态变化                 |
| warn  | 降级或可恢复异常                 |
| error | 未恢复的功能失败                 |

## 设置最低级别

开发服务器默认 `debug`。
生产构建默认 `warn`，包括 `--mode test` 的构建。
构建模式名称不决定默认级别，Vite 的 `DEV` 标志决定默认级别。

构建期通过环境变量覆盖：

```dotenv
VITE_LOG_LEVEL=info
```

运行期通过浏览器 `localStorage` 覆盖，优先于构建期设置。
键名是 `${VITE_STORAGE_PREFIX}LOG_LEVEL`，默认前缀对应 `RAPIDKIT_LOG_LEVEL`。
值是原始字符串，不使用项目存储工具的 JSON 编码。

```javascript
localStorage.setItem("RAPIDKIT_LOG_LEVEL", "debug")
location.reload()
```

排查结束后恢复默认：

```javascript
localStorage.removeItem("RAPIDKIT_LOG_LEVEL")
location.reload()
```

有效值为 `debug`、`info`、`warn`、`error`、`silent`。
`silent` 关闭 logger 的全部控制台输出，不关闭显式 Sentry 上报。
无效的存储值回退到构建期设置，无效的构建期值回退到默认值。
浏览器拒绝读取存储时，继续使用构建期设置或默认值。
设置在模块首次加载时读取一次，修改后需刷新页面。

## 安全字段

不要传入令牌、密码、Cookie、请求配置、请求正文或完整响应体。
控制台截图与录屏也可能外传。
普通对象与普通 `Error` 由调用方保证安全，logger 不递归清理它们。

Axios 错误应作为直接参数传入：

```typescript
logger.error("Request failed", error)
```

logger 使用 `isAxiosError()` 识别错误，并输出安全摘要：

- HTTP 方法与不含 origin、query、fragment 的路径。
- HTTP 状态、数字业务码和格式合法的错误码。
- 分开的客户端尝试编号、API 响应确认编号和网关编号。
- 标准 Axios 错误消息；自定义消息替换为 `Request failed`。

摘要不保留请求配置、认证头、请求正文和响应正文。
不要传 `{ error }` 包装对象；该对象会按普通对象原样输出。
自动转换 Axios 参数需要包装日志调用，因此开发者工具可能显示 logger 的位置。
普通 `Error` 自身的堆栈仍可跳转到错误源头。

## 内置日志点

| 模块 scope                           | 内容                                                      |
| ------------------------------------ | --------------------------------------------------------- |
| request                              | 请求开始、HTTP 状态、业务码、耗时、请求编号，以及等待刷新 |
| auth-refresh                         | 刷新开始、成功/失败、等待同一次刷新的调用数               |
| router                               | 导航开始、结果与固定重定向原因                            |
| socket / app-socket                  | 连接、断开、重连与安全失败原因码                          |
| permission-sync / permission-refresh | 触发来源、快照请求、完成和失败                            |
| observability                        | 显式捕获的浏览器错误，未配置 DSN 时同样输出               |
| service / app-version                | 配置解析错误和版本检查错误                                |

请求耗时使用单调时钟，只供诊断。
没有响应时，输出的编号可能只是客户端准备发送的编号，不能证明服务端已收到请求。
后台刷新与并发请求保持原有鉴权、重试和身份检查行为。

## 无 Sentry 的线上诊断

Vue 前端独立维护安全内存时间线，不需要 DSN。用户可在头像菜单选择“导出诊断包”，也可从错误提示直接导出 JSON。没有登录时可使用错误提示中的入口。导出只是浏览器下载，不发送网络请求，不写入浏览器存储，不需要新增后端采集接口。

| 内容       | 当前覆盖                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------- |
| 操作上下文 | 用户与角色写操作、角色权限、代登录、任务运行/撤销、定时任务启停、通知发布/取消/撤回/重试       |
| 请求       | 固定 operation、方法、状态码、耗时、重试次数、操作编号及三种请求编号                           |
| 页面与连接 | 编译期路由名称、导航结果、Socket namespace/连接编号、连接/断开/恢复和安全原因码                |
| 权限同步   | 固定触发来源、合并/节流次数、快照重试、等待确认和应用结果                                      |
| 故障快照   | 原生 error、未处理 Promise、bootstrap、Vue 渲染/路由、应用静态资源、意外请求失败及 Socket 故障 |

操作编号通过参数显式传给对应请求，保存在浏览器中，不增加 HTTP 头。其他接口使用固定 operation `other`；后台轮询和并发请求不会继承最近一次操作。重试保留操作编号，单独记录每次尝试。请求故障只捕获网络错误、HTTP 5xx 和框架错误码 7001；预期业务拒绝和取消仍可在时间线看到结果。

原有创建用户、保存角色权限、运行任务由界面显式传入操作快照。新增的单请求写操作在 API service 函数调用时创建自己的快照，包含 `action/start → request/start → request/result → action/result`；它表示一次业务 API 调用，自动触发的调用也会记录，不能当作用户点击或业务审计。

| 固定操作码                                                                                    | 覆盖                                           |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `user.update` / `user.delete` / `user.batch_delete` / `user.password.change`                  | 用户修改、删除、批量删除、密码修改             |
| `role.create` / `role.update` / `role.delete` / `role.batch_delete`                           | 角色增改删及批量删除                           |
| `impersonation.start` / `impersonation.stop`                                                  | 代登录开始和结束；身份切换后按原规则清空时间线 |
| `task.revoke` / `schedule.toggle`                                                             | 任务撤销与定时任务启停                         |
| `notification.publish` / `notification.cancel` / `notification.recall` / `notification.retry` | 通知发布、取消、撤回、失败投递重试             |

Socket 事件只保留 `/`、`/notifications`、`/dashboard`、`/worker`、`/chat` 这五个固定 namespace；`socket_connection_id` 只接受 1–128 位安全字符。Socket.IO 在断开回调前可能清空 ID，因此时间线保留上次连接成功时的编号。`io server disconnect` 和 `io client disconnect` 分别归一为 `server_disconnect`、`client_disconnect`。鉴权撤销、刷新开始/结果和重连结果使用固定原因码、次数及单调耗时，不记录握手和错误原文。重连的 attempt 来自 SDK；鉴权恢复显式重连记为 1。observation_count 是本段连接失败回调次数，与重连次数分别统计。

首次普通连接失败输出 ERROR；连续失败达到 3 次后，每个 Socket 最多每 60 秒输出一条 WARNING 摘要，恢复时输出一次 INFO。正常连接、断开和重连过程仍是 DEBUG。控制台最低级别不影响内存时间线；只勾选 DevTools 全部级别不能覆盖应用日志级别。连接日志只在状态变化时产生，排查时勾选 Preserve log、清空筛选后刷新页面。

权限事件的 operation 为 `permission.sync`、`permission.fetch`、`permission.apply`。触发来源为 `server_signal`、`socket_reconnect`、`permission_denied` 或 `manual`；只记录固定原因、最多两次快照尝试、应用结果和有界计数，不包含角色或权限清单。sync 成功表示刷新回调结束；是否拿到并应用快照需继续看 fetch/apply，等待确认也单独记录。旧身份或已重置流程的异步结果不写入新时间线。

时间线最多保留最近 5 分钟的 50 条事件，单条最多 512 字节，总计最多 16 KiB。故障冻结当时的时间线，最多保留 3 个快照；同类故障每分钟最多采集 3 次，所有故障合计每分钟最多 20 次，相同 Error 对象去重。JSON 包最多 64 KiB，超量时先移除较早的快照，再裁剪实时事件。冻结快照可保留到身份变化、刷新页面或被后续故障淘汰。

诊断包包含 schema_version、构建时间、环境、导出时间、随机页面编号、时间线、故障及 `lookup` 编号索引。所有事件和故障上下文字段均经白名单过滤；不包含 URL、query/fragment、表单、身份、Cookie、token、存储、DOM、请求/响应正文或任意错误原文。堆栈只保留静态 assets 文件名及行列号，资源错误只保留同源应用 assets 文件名。登录、退出、代登录等逻辑身份变化会清空记录，普通 token 轮换保留上下文。

这些限制适用于诊断包。控制台普通对象/Error 仍遵循前文调用方保证安全的规则；不要将完整控制台截图当成脱敏包。

## 复用现有服务端日志

错误提示分别展示并支持复制以下编号，诊断包也按命名空间建立索引：

| 字段                | 含义与查询入口                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `request_id`        | API 响应 `X-Request-ID` 中确认的 21 位编号；在现有 API/Worker 日志中搜索 request_id                                      |
| `edge_request_id`   | 响应 `X-Edge-Request-ID` 中的 32 位十六进制编号；在 Nginx access 日志中搜索 edge_request_id，再结合上下文检查 error 日志 |
| `client_request_id` | 浏览器为单次尝试生成的 21 位编号；先查 Nginx 同名字段，再核对 API request_id；查不到不代表服务端没有执行                 |
| `action_id`         | 本地一次业务操作编号，用于串起时间线中的操作与请求，不作为服务端索引                                                     |
| `diagnostic_id`     | 本地故障快照编号，用于对应用户错误提示与诊断包，不是 Sentry 事件编号                                                     |

先在包内找到对应 diagnostic_id 和 action_id，再使用故障上下文或 `lookup.request_ids` 查询现有日志；只有网关编号时查 Nginx，再按网关转发/上游响应编号继续找 API 日志。跨域 API 已暴露上述两个响应头；实际网关仍需沿用现有生成与透传配置。客户端编号与响应编号可能不同，必须分别核对。服务端审计、Celery 任务和 Socket 事件继续使用现有 request_id 关联规则。

浏览器超时未收到响应头时，包内可能只有 client_request_id。生产 Nginx 已记录校验后的该字段，即使最终为 499/502 也能查询，再取该行 edge_request_id 与上游 request_id 继续定位。该字段是客户端声明，不能证明 API 执行或作为可信身份。Socket 则按 namespace + socket_connection_id 查询后端 `socket.connected` / `socket.disconnected`，与 HTTP 编号分开使用。

网络失败只能说明浏览器未获得有效响应，不能证明请求未执行。重试写操作前先核查服务端日志、任务状态或业务结果，沿用业务幂等规则。

无自动上传时，浏览器刷新、关闭或身份变化后无法追溯已清除的记录；需要用户及时导出并交给排障人员。当前没有集中检索前端事件、自动告警、会话回放或服务端跨度追踪。生产构建的 assets 行列号需结合对应构建产物或私有 source map 分析。

本地浏览器验收可先构建无 DSN 的生产前端，再执行 `node scripts/test-local-diagnostics.mjs`。脚本使用本机合成 API 和 Chromium，验证实际错误反馈、编号复制、JSON 下载、秘密过滤与无额外网络请求；产物位于 `logs/verification/local-diagnostics-browser/`，不访问真实账户或启用 Sentry。

## 与可选线上上报的关系

logger 只写控制台，不上传，不持久化，不自动创建 Sentry 事件或 breadcrumbs。
需要线上上报时继续显式调用 `captureBrowserError()`。
该函数先写一条 `observability` 的 error 日志，再按已有启用条件上报。
因此未配置 DSN 的开发环境也能看到 Vue 显式捕获的渲染错误。
SDK 自动 console 采集继续关闭。

`captureBrowserError()` 也会冻结本地故障快照并返回本地 diagnostic_id。
原生异常监听与本地导出独立于 SDK 是否启用，`silent` 不关闭这些本地能力。
当前暂不开启 Sentry。以后启用时仍需验收事件接收、源码还原与实际部署配置；本地时间线不依赖该验收。
部署前提与操作步骤见[生产可观测性](/backend/observability)。

## lint 约束

`apps/frontend/src/**` 启用 `no-console: error`。
logger 实现和自动生成的 `router/elegant/**` 豁免。
规则不改变 React admin 或构建脚本的日志行为。
从仓库根目录和 `apps/frontend` 目录运行 lint 都会生效。
新增运行日志应使用固定 scope 的 logger。
