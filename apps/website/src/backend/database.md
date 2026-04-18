# 数据库

## 技术选型

项目使用 [SQLModel](https://sqlmodel.tiangolo.com/) 作为 ORM 层，它将 SQLAlchemy 与 Pydantic 深度融合，一个模型同时作为数据库表定义和数据校验 Schema。

数据库驱动采用双引擎策略：

| 场景                     | 驱动    | 协议  |
| ------------------------ | ------- | ----- |
| 异步业务请求             | asyncpg | async |
| 同步操作（Alembic 迁移） | psycopg | sync  |

:::info
SQLModel 继承自 SQLAlchemy ORM 和 Pydantic BaseModel，因此模型定义可直接用于 API 请求响应校验，无需额外编写 Schema。
:::

## 连接配置

`Config` 类（`src/core/config.py`）从环境变量读取 PostgreSQL 连接参数，并通过属性方法动态生成连接 URL：

```python
# Config 类属性
ASYNC_DATABASE_POSTGRESQL_URL  # asyncpg 异步连接
SYNC_DATABASE_POSTGRESQL_URL   # psycopg 同步连接
```

引擎和会话在 `src/core/database.py` 中创建：

```python
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import create_engine

# 异步引擎 + 同步引擎，pool_recycle=300 防止连接超时
async_engine = create_async_engine(ASYNC_DATABASE_URL, echo=settings.ENVIRONMENT.is_debug, pool_recycle=300)
sync_engine = create_engine(SYNC_DATABASE_URL, echo=settings.ENVIRONMENT.is_debug, pool_recycle=300)

# 会话工厂
AsyncSessionLocal = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
SyncSessionLocal = sessionmaker(sync_engine, class_=Session, expire_on_commit=False)
```

环境变量配置项：

| 变量                      | 说明         | 示例                 |
| ------------------------- | ------------ | -------------------- |
| `POSTGRESQL_ASYNC_SCHEME` | 异步协议     | `postgresql+asyncpg` |
| `POSTGRESQL_SYNC_SCHEME`  | 同步协议     | `postgresql+psycopg` |
| `POSTGRESQL_USERNAME`     | 数据库用户名 | `postgres`           |
| `POSTGRESQL_PASSWORD`     | 数据库密码   | -                    |
| `POSTGRESQL_HOST`         | 主机地址     | `localhost`          |
| `POSTGRESQL_PORT`         | 端口号       | `5432`               |
| `POSTGRESQL_DATABASE`     | 数据库名     | `app`                |

## 基础模型

所有业务模型继承自 `src/common/models.py` 中的自定义 `SQLModel` 基类，统一提供主键和时间戳字段：

```python
from datetime import datetime
from uuid import UUID

from sqlmodel import Field
from sqlmodel import SQLModel as _SQLModel

from src.utils.uuid7 import uuid7


class SQLModel(_SQLModel):
    id: UUID = Field(
        default_factory=uuid7,
        primary_key=True,
        index=True,
        nullable=False,
        description="唯一ID",
    )
    create_time: datetime = Field(default_factory=datetime.now, description="创建时间")
    update_time: datetime = Field(
        default_factory=datetime.now,
        sa_column_kwargs={"onupdate": datetime.now},
        description="更新时间",
    )
```

| 字段          | 类型       | 说明                              |
| ------------- | ---------- | --------------------------------- |
| `id`          | `UUID`     | UUID7 主键，有序且全局唯一        |
| `create_time` | `datetime` | 记录创建时间，自动填充            |
| `update_time` | `datetime` | 记录更新时间，自动触发 `onupdate` |

:::info
UUID7 基于时间戳生成，兼具全局唯一性和有序性，优于 UUID4 的随机方案，对数据库索引更友好。
:::

## 通用 CRUD

`packages/common/src/rapidkit_common/crud.py` 提供泛型 CRUD 基类 `BaseCRUD[Model]`，为任意领域模型提供零样板代码的完整增删改查操作。

```python
class BaseCRUD(Generic[Model]):
    model: ClassVar[type[SQLModel]]  # 子类必须声明

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
```

**事务管理**：CRUD 方法仅执行 `flush()`，不调用 `commit()`。事务的提交/回滚由 session 生命周期管理（FastAPI 依赖注入或 `async with` 块）。

核心方法：

| 方法                     | 签名                                                   | 说明                                             |
| ------------------------ | ------------------------------------------------------ | ------------------------------------------------ |
| `get`                    | `get(id, *, nullable=True, schema=None)`               | 按主键查询，`nullable=False` 未找到时抛异常      |
| `get_by_ids`             | `get_by_ids(ids, *, order_by, schema)`                 | 按主键列表批量查询                               |
| `get_all`                | `get_all(*filters, order_by, schema)`                  | 条件查询所有记录                                 |
| `get_count`              | `get_count(*filters)`                                  | 条件计数                                         |
| `get_paginate`           | `get_paginate(*filters, page, size, order_by, schema)` | 单查询分页（窗口函数），返回 `PaginatedResponse` |
| `get_paginate_by_cursor` | `get_paginate_by_cursor(*filters, cursor, size, ...)`  | 游标分页，返回 `CursorPaginatedResponse`         |
| `exists`                 | `exists(*filters)`                                     | 存在性检查，`SELECT 1 ... LIMIT 1`               |
| `create`                 | `create(dict \| PydanticBaseModel)`                    | 创建记录                                         |
| `create_all`             | `create_all(items)`                                    | 批量创建                                         |
| `update_by_id`           | `update_by_id(id, dict \| PydanticBaseModel)`          | 按主键更新，仅更新已设置的字段                   |
| `update_all`             | `update_all(updates)`                                  | ORM 批量 UPDATE，一条语句更新多行                |
| `delete`                 | `delete(id)`                                           | 按主键删除，返回被删除的记录                     |
| `delete_all`             | `delete_all(ids)`                                      | 按主键列表批量删除                               |

查询方法支持可选的 `schema` 参数（Pydantic 模型类），传入时自动序列化返回结果。

#### 分页优化

`get_paginate` 使用 `COUNT(*) OVER()` 窗口函数在单次查询中同时获取分页数据和总数，避免传统的 COUNT + SELECT 两次查询：

```python
# 内部实现原理
statement = select(Model, func.count().over().label("_total")).offset(...).limit(...)
# 一次查询同时返回记录和总数
```

#### 批量更新

`update_all` 使用 SQLAlchemy ORM 批量 UPDATE，将 N 次单行 UPDATE 合并为一条语句：

```python
# 用法示例
await crud.update_all([
    {"id": uuid1, "status": Status.OFF},
    {"id": uuid2, "status": Status.ON},
])
# 内部使用 session.exec(update(Model), params=updates)
# SQLAlchemy 自动将 dict 中的 id 作为 WHERE 条件
```

使用示例（领域 CRUD 继承）：

```python
from rapidkit_common.crud import BaseCRUD
from plugin_auth.role.models import Role


class RoleCRUD(BaseCRUD[Role]):
    """角色 CRUD，继承即拥有全部增删改查能力。"""
    model = Role
```

## Alembic 迁移

### 多分支迁移策略

项目采用 Alembic 多分支迁移策略，每个插件维护独立的迁移分支。迁移文件分别存放在：

- `alembic/versions/` — 基线迁移（初始 schema）
- `plugins/<name>/migrations/versions/` — 各插件的独立迁移

`alembic/env.py` 通过调用各插件的 `register()` 函数动态发现模型，无需手动维护模型导出列表。

### 常用命令

| 命令                            | 说明                 |
| ------------------------------- | -------------------- |
| `alembic upgrade heads`         | 升级所有分支到最新   |
| `alembic upgrade <plugin>@head` | 升级指定插件分支     |
| `alembic downgrade <plugin>@-1` | 回退指定插件一个版本 |
| `alembic heads`                 | 查看所有分支的 head  |
| `alembic history`               | 查看迁移历史         |

### 为插件生成迁移

```bash
# 首次迁移（创建分支）
uv run alembic revision --autogenerate \
  --branch-label=notification \
  -m "add notification table" \
  --version-path plugins/notification/migrations/versions/

# 后续迁移（追加到已有分支）
uv run alembic revision --autogenerate \
  --head=notification@head \
  -m "add read_at column" \
  --version-path plugins/notification/migrations/versions/
```

:::warning
新增插件时，需要在 `alembic.ini` 的 `version_locations` 和 `alembic/env.py` 的 `PLUGIN_MODULES` 中注册，否则 Alembic 无法发现该插件的模型和迁移文件。
:::

## 添加新模型

1. **在插件中创建模型**：

```python
# plugins/notification/src/plugin_notification/models.py
from sqlmodel import Field
from rapidkit_common.models import SQLModel

class Notification(SQLModel, table=True):
    __tablename__ = "notifications"
    title: str = Field(max_length=200, description="通知标题")
    content: str = Field(description="通知内容")
```

2. **在 register() 中注册模型**：

```python
return PluginManifest(
    name="notification",
    models=[Notification],  # 确保包含所有模型类
    ...
)
```

3. **生成并应用迁移**：

```bash
uv run alembic revision --autogenerate --branch-label=notification \
  -m "add notification table" \
  --version-path plugins/notification/migrations/versions/
uv run alembic upgrade heads
```
