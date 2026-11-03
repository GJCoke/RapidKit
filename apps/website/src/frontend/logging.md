# 开发日志

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
- 合法的请求编号。
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

## 与线上上报的关系

logger 只写控制台，不上传，不持久化，不自动创建 Sentry 事件或 breadcrumbs。
需要线上上报时继续显式调用 `captureBrowserError()`。
该函数先写一条 `observability` 的 error 日志，再按已有启用条件上报。
因此未配置 DSN 的开发环境也能看到 Vue 显式捕获的渲染错误。
SDK 自动 console 采集继续关闭。

当前只完成开发日志阶段。
Sentry 将在实际部署后验收事件接收、源码还原和服务端编号关联。
安全操作时间线与聚合通知在该验收后继续实施。
部署前提与操作步骤见[生产可观测性](/backend/observability)。

## lint 约束

`apps/frontend/src/**` 启用 `no-console: error`。
logger 实现和自动生成的 `router/elegant/**` 豁免。
规则不改变 React admin 或构建脚本的日志行为。
从仓库根目录和 `apps/frontend` 目录运行 lint 都会生效。
新增运行日志应使用固定 scope 的 logger。
