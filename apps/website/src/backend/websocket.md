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
