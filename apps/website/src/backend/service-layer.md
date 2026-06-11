# Service 层约定

Service 层是插件业务逻辑的核心所在，位于 API 路由层和 CRUD 数据访问层之间，负责编排业务流程、执行领域规则、协调外部依赖。

## 职责划分

```text
api.py (路由层)
  ├── 参数接收与校验
  ├── 调用 Service 函数
  └── 构造响应

services.py (业务层)
  ├── 业务逻辑编排
  ├── 条件过滤构建
  ├── 缓存失效
  ├── 权限判断（非装饰器级别）
  └── 跨 CRUD 协调

providers.py (跨插件服务层)
  ├── Protocol 实现类
  ├── ServiceRegistry 注册的能力
  └── 自管理 session 的跨插件入口

crud.py (数据层)
  ├── 单表 CRUD 操作
  ├── 分页查询
  └── 批量操作
```

| 关注点         | 放在哪里      | 示例                                     |
| -------------- | ------------- | ---------------------------------------- |
| HTTP 请求解析  | `api.py`      | Query 参数、Path 参数、Body 解析         |
| 过滤条件构建   | `services.py` | `filter_user(status, keyword)`           |
| 密码加密/解密  | `services.py` | `process_password(rsa_password)`         |
| 缓存失效       | `services.py` | `invalidate_user_cache(redis, id)`       |
| 数据库读写     | `crud.py`     | `get_paginate()`, `create()`, `delete()` |
| 跨模型联合查询 | `services.py` | 查询关联用户后批量清缓存                 |
| 响应构造       | `api.py`      | `Response(data=...)`                     |

:::warning
Service 层不持有 `request`、`response` 等 HTTP 上下文对象。需要当前用户信息时，通过函数参数传入，而非在 Service 中注入依赖。
:::

## 命名规范

### 文件命名

- 单域名插件：`services.py`（一个文件涵盖所有业务逻辑）
- 多域名插件：`{domain}/services.py`（每个子域名独立）

### 函数命名

| 前缀          | 用途             | 示例                           |
| ------------- | ---------------- | ------------------------------ |
| `filter_`     | 构建查询过滤条件 | `filter_user(status, keyword)` |
| `process_`    | 数据转换/处理    | `process_password(raw)`        |
| `invalidate_` | 缓存失效         | `invalidate_user_cache()`      |
| `validate_`   | 业务校验         | `validate_role_assignment()`   |
| `notify_`     | 通知/事件触发    | `notify_password_changed()`    |
| `sync_`       | 数据同步         | `sync_role_permissions()`      |

:::tip
Service 函数应为纯函数或仅依赖显式参数的异步函数。依赖通过参数注入，不要在函数内部访问全局状态。
:::

## 决策树：逻辑该放哪里

```text
该逻辑是否被其他插件需要？
├── YES → providers.py（实现 Protocol，注册 ServiceRegistry）
└── NO
    ├── 涉及业务规则/编排？ → services.py
    └── 纯数据读写？ → crud.py（或 api.py 直接一行调用 crud）
```

**api.py 可以直接调用 crud 的唯一场景：** 单一 CRUD 操作 + 无业务判断。例如 `crud.get(id)` 直接返回。

**api.py 超过 5 行业务逻辑** 时必须提取到 services.py。

## 依赖注入规则

| 场景                               | 方式                    | 说明                                         |
| ---------------------------------- | ----------------------- | -------------------------------------------- |
| 本插件 CRUD/Redis/Session → api.py | FastAPI `Depends`       | 标准 deps.py 模式                            |
| api.py → services.py               | 显式函数参数传递        | `await do_something(crud=crud, redis=redis)` |
| services.py → 跨插件能力           | `get_service(Protocol)` | 仅用于跨插件，本插件内禁用                   |
| providers.py → 基础设施            | 构造器注入              | `__init__(self, session_factory)`            |

:::danger
`get_service()` 是跨插件边界的唯一调用方式。**同一插件内部永远使用显式参数传递**，绝不通过 ServiceRegistry 获取本插件的服务。
:::

Service 函数不使用 FastAPI `Depends`——它们是普通函数，由 `api.py` 调用时传入所需依赖：

```python
# services.py — 纯业务函数
async def invalidate_user_cache(redis: AsyncRedisClient, user_id: UUID) -> None:
    redis_key = user_structure.format(user_id=user_id)
    await redis.delete(redis_key)


# api.py — 路由层注入依赖后传入 Service
@router.delete("/{user_id}")
async def delete_user(
    user_id: UUID,
    current_user: VerifyPermissionDep,
    user_crud: UserManageCrudDep,
    redis: RedisDep,
) -> Response[bool]:
    await user_crud.delete(user_id)
    await invalidate_user_cache(redis, user_id)
    return Response(data=True)
```

:::info
这种模式使 Service 函数易于单元测试——直接传入 mock 对象即可，无需构造 FastAPI 依赖注入上下文。
:::

## 异常处理

Service 层使用 `AppException` 抛出业务异常，由全局异常处理器统一捕获：

```python
from rapidkit_framework.exceptions import AppException
from plugin_auth.status_codes import AuthStatusCode


async def invalidate_user_session(redis: AsyncRedisClient, user_id: UUID) -> None:
    user = await redis.hgetall(user_structure.format(user_id=user_id))
    if not user:
        raise AppException(AuthStatusCode.USER_NOT_FOUND)
    # ...
```

规则：

- 使用插件自身的 `StatusCode` 枚举，不要跨插件引用错误码
- 不要 try/catch 后吞掉异常——让 `AppException` 向上冒泡
- 系统级异常（数据库超时等）不需要手动处理，全局兜底处理器会捕获

## 事务策略

### Session-Per-Request 模型

每个 HTTP 请求对应一个数据库 Session，由 `get_async_session()` 依赖管理：

```python
async def get_async_session() -> AsyncIterator[AsyncSession]:
    async with factory() as session:
        try:
            yield session
            await session.commit()                    # 成功：一次性 commit 所有 flush
            await run_after_commit_hooks(session)     # commit 后执行注册的回调
        except Exception:
            await session.rollback()                  # 失败：整体回滚
            raise
```

BaseCRUD 的写入方法（`create`、`update_by_id`、`delete` 等）只调用 `flush()`，不调用 `commit()`。真正的 commit 在请求结束时统一执行，因此同一请求内的多次写入天然构成一个事务。

:::info
不需要手动调用 `session.commit()` 或 `session.rollback()`。框架在请求结束时自动处理。
:::

### Savepoint 隔离

BaseCRUD 使用 `begin_nested()`（SQL SAVEPOINT）隔离 IntegrityError：

```python
async def create(self, data: dict) -> Model:
    record = self.model.model_validate(data)
    try:
        async with self.session.begin_nested():
            self.session.add(record)
            await self.session.flush()
    except IntegrityError:
        raise AppException(StatusCode.ALREADY_EXISTS)
    await self.session.refresh(record)
    return record
```

效果：如果当前写入触发唯一约束冲突，只有这次写入被回滚（savepoint 释放），同请求中之前的 flush 保留不受影响。

### after_commit Hook

Redis 缓存失效等外部副作用必须在 DB commit 成功后才执行，使用 `after_commit` 注册：

```python
from rapidkit_common.transaction import after_commit

@router.delete("/{user_id}")
async def delete_user(user_id: UUID, redis: RedisDep, session: SessionDep, ...):
    await user_crud.delete(user_id)
    after_commit(session, invalidate_user_cache, redis, user_id)
    after_commit(session, invalidate_user_session, redis, user_id)
    return Response(data=True)
```

注册的回调：

- 仅在 `commit()` 成功后执行
- 如果请求异常导致 rollback，回调不会执行（Redis 不会被错误失效）
- 回调失败会记录警告日志，但不影响已返回的响应

### 何时使用 after_commit

| 场景                          | 策略           |
| ----------------------------- | -------------- |
| DB 写入后的 Redis 缓存失效    | `after_commit` |
| DB 写入后的事件总线通知       | `after_commit` |
| 纯读取操作后的 Redis 缓存填充 | 直接调用       |
| 与 DB 写入无关的 Redis 操作   | 直接调用       |
| 日志记录                      | 直接调用       |

:::danger
**绝不**在 `after_commit` 回调中执行数据库写入操作——此时 session 已关闭。回调仅用于外部系统（Redis、消息队列、通知等）。
:::

### 显式事务

当一个业务操作涉及多次写入且需要原子性时，在 Service 层显式管理事务：

```python
async def transfer_role(
    session: AsyncSession,
    from_user_id: UUID,
    to_user_id: UUID,
    role_code: str,
) -> None:
    """将角色从一个用户转移到另一个用户（原子操作）。"""
    async with session.begin():
        from_user = await session.get(User, from_user_id)
        to_user = await session.get(User, to_user_id)
        from_user.roles.remove(role_code)
        to_user.roles.append(role_code)
```

:::warning
大多数场景不需要显式事务——session-per-request 模型已经提供了请求级原子性。仅在需要**嵌套事务语义**（如部分回滚）时才使用 `session.begin()`。
:::

### 事务边界原则

| 场景                 | 策略                                     |
| -------------------- | ---------------------------------------- |
| 单次 CRUD 写入       | BaseCRUD flush + 请求结束时自动 commit   |
| 多次写入（同请求）   | 天然原子（同一 session，一次 commit）    |
| IntegrityError 隔离  | BaseCRUD 使用 `begin_nested()` savepoint |
| DB 写入 + Redis 失效 | `after_commit` hook                      |
| 读后写（乐观锁）     | Service 层版本号校验                     |

## 并发控制

### 乐观锁

对于高并发更新场景，使用版本号实现乐观锁：

```python
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode


async def update_with_version(
    session: AsyncSession,
    model_id: UUID,
    update_data: dict,
    expected_version: int,
) -> Model:
    instance = await session.get(Model, model_id)
    if instance.version != expected_version:
        raise AppException(StatusCode.CONCURRENT_MODIFICATION)
    instance.version += 1
    for key, value in update_data.items():
        setattr(instance, key, value)
    await session.commit()
    return instance
```

### 分布式锁

对于需要跨进程互斥的操作（如定时任务调度），使用 Redis 分布式锁：

```python
async def acquire_task_lock(redis: AsyncRedisClient, task_id: str, ttl: int = 30) -> bool:
    """尝试获取任务锁，防止重复执行。"""
    return await redis.set(f"lock:task:{task_id}", "1", nx=True, ex=ttl)
```

:::tip
分布式锁的 TTL 应大于任务预期执行时间，防止锁提前释放导致并发执行。
:::

## 缓存策略

采用 Cache-Aside 模式——读时填充缓存，写时主动失效：

```python
# 读取（带缓存）— 通常在 deps.py 或 CRUD 层
async def get_user_cached(redis: AsyncRedisClient, user_id: UUID) -> User | None:
    cached = await redis.hgetall(user_structure.format(user_id=user_id))
    if cached:
        return User(**cached)
    # cache miss: 从 DB 读取并填充缓存
    user = await db_get_user(user_id)
    if user:
        await redis.hset(user_structure.format(user_id=user_id), mapping=user.model_dump())
    return user


# 写入后失效 — 在 services.py
async def invalidate_user_cache(redis: AsyncRedisClient, user_id: UUID) -> None:
    await redis.delete(user_structure.format(user_id=user_id))
```

规则：

- **写入后立即失效缓存**，不要尝试更新缓存（避免竞态）
- 缓存键使用 `{domain}_structure` 常量模板，统一管理
- 设置合理的 TTL，防止缓存永不过期导致的内存泄漏

## Protocol 实现类 (providers.py)

当插件需要向其他插件暴露能力时（通过 `ServiceRegistry`），实现类统一放在 `providers.py` 中。

### 何时需要 providers.py

- 插件在 `PluginManifest.provides` 中声明了 Protocol
- 实现了 `rapidkit_common/protocols/` 中定义的 Protocol 接口

如果插件只消费其他插件的服务（通过 `get_service()`），不需要 `providers.py`。

### 文件结构

```python
# plugins/<name>/src/plugin_<name>/providers.py

from rapidkit_core.database import AsyncSessionLocal


class UserResolverImpl:
    """UserResolver Protocol 实现。"""

    def __init__(self, session_factory=AsyncSessionLocal):
        self._session_factory = session_factory

    async def get_by_id(self, user_id: UUID) -> UserProtocol | None:
        async with self._session_factory() as session:
            crud = UserManageCRUD(session)
            return cast(UserProtocol | None, await crud.get(user_id, nullable=True))
```

### 规则

| 规则                           | 说明                                                |
| ------------------------------ | --------------------------------------------------- |
| 构造函数注入 `session_factory` | 默认 `AsyncSessionLocal`，测试时可替换              |
| 类名统一 `{ProtocolName}Impl`  | 如 `UserResolverImpl`、`PermissionCacheManagerImpl` |
| 每个类实现一个 Protocol        | 不要在一个类中混合多个 Protocol                     |
| `services.py` 中不放任何 class | 所有类定义都在 `providers.py`                       |
| 只注册完整实现的 Protocol      | **绝不**注册 `NotImplementedError` 的 stub          |

### 注册

在 `__init__.py` 的 `register()` 中引用 `providers.py`：

```python
def register_services(registry: ServiceRegistry) -> None:
    from plugin_user.providers import UserResolverImpl, UserQueryServiceImpl

    registry.register(UserResolver, UserResolverImpl())
    registry.register(UserQueryService, UserQueryServiceImpl())
```

### 与 services.py 的区别

| 对比维度     | services.py                 | providers.py                     |
| ------------ | --------------------------- | -------------------------------- |
| 代码形式     | 纯函数                      | 类（实现 Protocol）              |
| 调用方       | 同插件的 api.py             | 其他插件通过 `get_service()`     |
| Session 来源 | 参数传入（来自 FastAPI DI） | 构造函数注入的 `session_factory` |
| 测试方式     | 直接传 mock 参数            | 替换 `session_factory`           |

### 单元测试

```python
from unittest.mock import AsyncMock, MagicMock

async def test_user_resolver():
    # 构造 mock session factory
    mock_session = AsyncMock()
    mock_session.__aenter__.return_value = mock_session
    mock_session.__aexit__.return_value = None

    resolver = UserResolverImpl(session_factory=lambda: mock_session)
    result = await resolver.get_by_id(some_uuid)
    # 断言 session 上的操作
```

## 测试

Service 函数因为不依赖 FastAPI 框架，可直接进行单元测试：

```python
import pytest
from unittest.mock import AsyncMock


@pytest.mark.asyncio
async def test_invalidate_user_cache():
    redis = AsyncMock()
    user_id = uuid4()

    await invalidate_user_cache(redis, user_id)

    redis.delete.assert_called_once()
```

对于涉及数据库的 Service 函数，使用集成测试（真实数据库 session）：

```python
@pytest.mark.asyncio
async def test_filter_user_by_keyword(session: AsyncSession):
    # 创建测试数据
    await create_test_user(session, name="Alice")
    await create_test_user(session, name="Bob")

    filters = filter_user(status=None, keyword="Ali")
    # 验证过滤条件逻辑
    assert len(filters) == 1
```

## Code Review 检查清单

审查 Service 层代码时，关注以下要点：

- [ ] `api.py` 中无超过 5 行的业务逻辑（if/else 分支、循环聚合、SQL 查询）
- [ ] `services.py` 不使用 `get_service()` 获取同插件依赖
- [ ] 注册的 providers 无 `NotImplementedError`（未实现就不注册）
- [ ] 跨插件通信通过 ServiceRegistry，无直接 import 其他插件内部模块
- [ ] Service 函数不持有 `request`/`response` 等 HTTP 上下文对象
- [ ] Redis key 操作不跨插件边界（通过 Protocol 封装）
