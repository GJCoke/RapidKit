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

# 异步引擎 + 同步引擎，pool_recycle=60 防止连接超时
async_engine = create_async_engine(ASYNC_DATABASE_URL, echo=settings.ENVIRONMENT.is_debug, pool_recycle=60)
sync_engine = create_engine(SYNC_DATABASE_URL, echo=settings.ENVIRONMENT.is_debug, pool_recycle=60)

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

`src/common/crud.py` 提供泛型 CRUD 基类 `BaseSQLModelCRUD[Model, CreateSchema, UpdateSchema]`，为任意领域模型提供零样板代码的完整增删改查操作。

```python
class BaseSQLModelCRUD(Generic[SQLModel, CreateSchema, UpdateSchema]):
    def __init__(self, model: type[SQLModel], *, session: AsyncSession | None = None, auto_commit: bool = True) -> None:
        ...
```

核心方法：

| 方法           | 签名                                             | 说明                                        |
| -------------- | ------------------------------------------------ | ------------------------------------------- |
| `get`          | `get(id, *, nullable=True)`                      | 按主键查询，`nullable=False` 未找到时抛异常 |
| `get_by_ids`   | `get_by_ids(ids, *, serializer)`                 | 按主键列表批量查询                          |
| `get_all`      | `get_all(*filters, order_by, serializer)`        | 条件查询所有记录                            |
| `get_paginate` | `get_paginate(*filters, page, size, serializer)` | 分页查询，返回 `PaginatedResponse`          |
| `create`       | `create(schema \| dict \| model)`                | 创建记录，支持多种输入类型                  |
| `create_all`   | `create_all(items)`                              | 批量创建                                    |
| `update`       | `update(model, update_in)`                       | 更新模型实例，仅更新已设置的字段            |
| `update_by_id` | `update_by_id(id, schema)`                       | 按主键更新                                  |
| `delete`       | `delete(id)`                                     | 按主键删除，返回被删除的记录                |
| `delete_all`   | `delete_all(ids)`                                | 按主键列表批量删除                          |

使用示例（领域 CRUD 继承）：

```python
from src.common.crud import BaseSQLModelCRUD
from src.domains.role.models import Role
from src.domains.role.schemas import CreateRole, UpdateRole


class RoleCRUD(BaseSQLModelCRUD[Role, CreateRole, UpdateRole]):
    """角色 CRUD，继承即拥有全部增删改查能力。"""
    pass
```

## Alembic 迁移

### 配置

迁移工具使用 Alembic，配置文件为项目根目录下的 `alembic.ini`，迁移环境在 `alembic/env.py`。

所有模型必须在 `src/domains/__init__.py` 中导出，Alembic 才能自动发现并生成迁移脚本：

```python
# src/domains/__init__.py
from src.domains.auth.models import User
from src.domains.menu.models import Menu
from src.domains.role.models import Role
from src.domains.router.models import InterfaceRouter
from src.domains.script.models import Script, ScriptExecution
from src.domains.worker.models import CeleryTaskResult, CeleryWorker

__all__ = ["User", "Role", "Menu", "InterfaceRouter", "CeleryWorker", "CeleryTaskResult", "Script", "ScriptExecution"]
```

### 常用命令

| 命令                                        | 说明             |
| ------------------------------------------- | ---------------- |
| `alembic revision --autogenerate -m "desc"` | 自动生成迁移脚本 |
| `alembic upgrade head`                      | 升级到最新版本   |
| `alembic downgrade -1`                      | 回退一个版本     |
| `alembic history`                           | 查看迁移历史     |

:::warning
每个新增模型都必须在 `src/domains/__init__.py` 中导出，否则 Alembic 无法检测到表结构变更。
:::

## 添加新模型

1. **创建模型文件** -- 在对应领域目录下新建 `models.py`：

```python
# src/domains/example/models.py
from sqlmodel import Field
from src.common.models import SQLModel


class Example(SQLModel, table=True):
    __tablename__ = "examples"

    name: str = Field(..., max_length=100, description="名称")
```

2. **导出模型** -- 在 `src/domains/__init__.py` 中添加导入：

```python
from src.domains.example.models import Example
```

3. **生成迁移脚本**：

```bash
alembic revision --autogenerate -m "add example table"
```

4. **应用迁移**：

```bash
alembic upgrade head
```
