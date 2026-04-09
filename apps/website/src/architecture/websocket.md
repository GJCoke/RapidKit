# 实时通信

## 架构

项目使用 [python-socketio](https://python-socketio.readthedocs.io/) 实现实时通信，以 ASGI 中间件的方式挂载到 FastAPI 应用上，路径为 `/socket.io`。

```
FastAPI App
  └── mount("/socket.io") → socketio.ASGIApp
        └── AsyncServer (async_mode="asgi")
              └── AsyncRedisManager (跨实例广播)
```

核心配置在 `src/sio/app.py`：

```python
from socketio import ASGIApp, AsyncRedisManager
from fastapi_sio_di import AsyncServer

redis_manager = AsyncRedisManager(url=str(settings.REDIS_URL))
socket = AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=[],
    client_manager=redis_manager,
)
socket_app = ASGIApp(socket)
```

:::info
`fastapi_sio_di` 是对 `python-socketio` 的封装，为事件处理器提供类似 FastAPI 的依赖注入能力。
:::

## 命名空间

| 命名空间    | 说明                                 |
| ----------- | ------------------------------------ |
| `/`（默认） | 连接管理、在线状态追踪               |
| `/chat`     | 聊天室功能                           |
| `/worker`   | Celery Worker 状态推送、任务状态更新 |

默认命名空间使用 Redis Set（`online_users`）追踪在线用户，支持快速查询在线人数和用户列表。

## 事件注册

事件处理器按文件组织在 `src/sio/events/` 目录下，通过 `auto_register_events()` 自动发现并注册：

```
src/sio/
├── app.py              # Socket.IO 实例和配置
└── events/
    ├── __init__.py
    ├── connection.py   # connect / disconnect 事件
    ├── chat.py         # 聊天相关事件
    ├── message.py      # 消息相关事件
    └── worker.py       # Worker 状态事件
```

`auto_register_events()` 扫描 `events/` 目录下所有非下划线开头的 `.py` 文件，动态导入模块以注册 `@socket.event` 装饰的处理器：

```python
def auto_register_events() -> None:
    base_path = Path(__file__).parent / "events"
    for file in base_path.glob("*.py"):
        if file.name.startswith("_"):
            continue
        module_name = f"sio.events.{file.stem}"
        spec = util.spec_from_file_location(module_name, file)
        module = util.module_from_spec(spec)
        spec.loader.exec_module(module)
```

添加新事件只需在 `events/` 目录下新建 `.py` 文件，使用 `@socket.event` 装饰器定义处理器即可自动注册。

## 连接认证

客户端连接时通过 `auth` 参数传递 JWT Access Token，服务端在 `connect` 事件中校验：

```python
@socket.event
async def connect(sid: SID, auth: AccessToken, db_user: AuthCrudDep, redis: RedisDep) -> Literal[False] | None:
    token = auth.access_token
    if not token:
        return False

    user = decode_token(token, auth_settings.ACCESS_TOKEN_KEY)
    user_info = await db_user.get(user.sub)
    if not user_info:
        return False

    # 建立 sid <-> user 双向映射
    user_id = str(user_info.id)
    await redis.hset(sid_user_structure.format(sid=sid), mapping=RedisUser(id=user_id, name=user_info.name))
    await redis.set(user_sid_structure.format(user_id=user_id), sid)
    await redis.sadd(online_users_structure, user_id)
```

Redis 中维护的映射关系：

| Key 模式             | 说明                       |
| -------------------- | -------------------------- |
| `user:<user_id>:sid` | 用户 ID → 会话 ID          |
| `sid:<sid>:user`     | 会话 ID → 用户信息（Hash） |
| `online_users`       | 在线用户 ID 集合（Set）    |

断开连接时自动清理上述映射。

## Redis 适配器

`AsyncRedisManager` 使用 Redis Pub/Sub 实现跨进程、跨实例的事件广播。

```python
redis_manager = AsyncRedisManager(url=str(settings.REDIS_URL))
```

:::warning
生产环境多实例部署时，Redis 适配器是必须的。没有它，不同实例上的客户端无法接收到彼此的事件。
:::

## Socket.IO Admin UI

在调试环境下，项目自动启用 Socket.IO Admin UI（`socketio.instrument`），提供可视化的连接和事件监控面板。

```python
if settings.ENVIRONMENT.is_debug:
    socket.instrument(
        {
            "username": settings.SOCKETIO_ADMIN_USERNAME,
            "password": settings.SOCKETIO_ADMIN_PASSWORD.get_secret_value(),
        }
    )
```

配置项：

| 环境变量                  | 默认值   | 说明                |
| ------------------------- | -------- | ------------------- |
| `SOCKETIO_ADMIN_USERNAME` | `admin`  | Admin UI 登录用户名 |
| `SOCKETIO_ADMIN_PASSWORD` | `123456` | Admin UI 登录密码   |

:::danger
Admin UI 仅在调试环境（`ENVIRONMENT.is_debug`）下启用。生产环境请确保修改默认密码或关闭该功能。
:::

## 前端连接

前端通过 `socket.io-client` 库与后端 Socket.IO 服务建立实时连接，封装为 Vue Composable `useSocket`，提供响应式的连接状态和生命周期管理。

### useSocket Hook

`useSocket` 定义在 `src/hooks/common/socket.ts`，核心功能：

```typescript
import { io, type Socket } from "socket.io-client"

export function useSocket(): Result {
  const socket = ref<Socket | null>(null)
  const isConnected = ref(false)
  const isConnecting = ref(false)

  const connect = (options: Options): Socket | undefined => {
    const instance = io(socketUrl, {
      path: "/socket.io",
      auth,
      transports: ["websocket", "polling"],
      ...ioOptions,
    })

    instance.on("connect", () => {
      isConnected.value = true
    })
    instance.on("disconnect", () => {
      isConnected.value = false
    })
    instance.on("connect_error", (err) => {
      onError?.(err)
    })

    socket.value = instance
    return instance
  }

  const disconnect = () => {
    socket.value?.disconnect()
    socket.value = null
  }

  // 组件卸载时自动断开连接
  onUnmounted(() => disconnect())

  return { socket, isConnected, isConnecting, connect, disconnect }
}
```

返回值说明：

| 属性           | 类型                  | 说明           |
| -------------- | --------------------- | -------------- |
| `socket`       | `Ref<Socket \| null>` | Socket.IO 实例 |
| `isConnected`  | `Ref<boolean>`        | 是否已连接     |
| `isConnecting` | `Ref<boolean>`        | 是否正在连接中 |
| `connect()`    | `Function`            | 建立连接       |
| `disconnect()` | `Function`            | 断开连接       |

### 连接配置

`connect` 方法接受以下配置项：

```typescript
interface Options {
  url: string // 服务端地址
  path?: string // Socket.IO 路径，默认 "/socket.io"
  auth?: any // 认证参数（如 JWT Token）
  namespace?: string // 命名空间，默认 "/"
  ioOptions?: Partial<ManagerOptions & SocketOptions> // 透传选项
  onConnect?: () => void
  onDisconnect?: (reason: Socket.DisconnectReason) => void
  onError?: (err: Error) => void
}
```

### 命名空间使用

前端按业务场景连接不同的命名空间：

| 命名空间  | 使用场景                     | 认证方式                  |
| --------- | ---------------------------- | ------------------------- |
| `/`       | 默认连接、在线状态           | JWT Token（`auth` 参数）  |
| `/chat`   | 聊天室功能                   | 用户名（`auth.username`） |
| `/worker` | Celery Worker 状态、任务更新 | 无（内部服务）            |

聊天室连接示例（`views/socketio/chat/`）：

```typescript
const instance = connect({
  url: url.origin,
  namespace: "/chat",
  auth: { username: props.username },
  ioOptions: {
    query: { group: props.group },
  },
  onConnect: () => socket.value?.emit("join", props.group),
})
```

Worker 状态连接示例（`views/queue/dashboard/`）：

```typescript
connect({
  url: baseUrl,
  namespace: "/worker",
  path: "/socket.io",
})

socket.value?.on("worker:status", (data: Api.Worker.WorkerStatusEvent) => {
  // 更新 Worker 状态
})

socket.value?.on("task:update", (data: Api.Worker.TaskUpdateEvent) => {
  // 更新任务状态
})
```

### 传输与重连

Socket.IO 客户端配置了双传输模式：

```typescript
transports: ["websocket", "polling"]
```

优先使用 WebSocket 协议，连接失败时自动降级为 HTTP 长轮询。Socket.IO 内置了自动重连机制，默认行为：

- 连接断开后立即尝试重连
- 采用指数退避策略，重连间隔逐步增大
- `connect_error` 事件在每次重连失败时触发，可用于错误提示

### 组件中的事件监听

组件通过 `socket.value?.on()` 监听服务端推送的事件。`useSocket` 在 `onUnmounted` 时自动调用 `disconnect()`，确保组件销毁后不会产生内存泄漏或无效事件监听。

典型使用模式：

```typescript
const { socket, connect } = useSocket()

onMounted(() => {
  connect({ url: baseUrl, namespace: "/worker" })

  socket.value?.on("worker:status", handleWorkerStatus)
  socket.value?.on("task:update", handleTaskUpdate)
})
```

:::tip
`useSocket` 的生命周期与组件绑定。如果需要全局持久连接（跨页面保持），应在 App 级组件或 Pinia store 中管理 Socket 实例。
:::
