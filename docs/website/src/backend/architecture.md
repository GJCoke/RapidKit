# Backend 架构说明

## 架构概述

本项目后端采用 **领域驱动混合架构（Domain-first Hybrid Architecture）**，基于 FastAPI + SQLModel + async SQLAlchemy 构建。

核心设计思路：**按业务领域组织代码，共享基础设施下沉到公共层**。

```
src/
├── core/              # 基础设施层：配置、数据库、异常、日志等
├── common/            # 公共层：基类模型、通用 CRUD、共享依赖、通用 Schema
├── domains/           # 业务领域层：每个领域自包含一套完整的业务逻辑
│   ├── auth/          #   认证领域
│   ├── role/          #   角色领域
│   ├── menu/          #   菜单领域
│   └── router/        #   接口路由领域
├── sio/               # Socket.IO 实时通信
├── middlewares/        # HTTP 中间件
├── queues/            # Celery 任务队列（含调度模型 schedule.py）
├── locales/           # 国际化
├── utils/             # 工具函数
└── main.py            # 应用入口（路由注册、中间件挂载、生命周期管理）
```

## 三层结构详解

### 1. `core/` — 基础设施层

存放与业务无关的底层基础设施，整个应用都依赖此层，但此层不依赖任何业务代码。

| 文件              | 职责                                   |
| ----------------- | -------------------------------------- |
| `config.py`       | 应用配置（Settings、环境变量）         |
| `database.py`     | 数据库引擎、会话工厂、Redis 管理器     |
| `exceptions.py`   | 全局异常定义                           |
| `status_codes.py` | 业务状态码枚举                         |
| `lifecycle.py`    | 应用生命周期事件（startup / shutdown） |
| `redis_client.py` | Redis 异步客户端封装                   |
| `log.py`          | 日志配置                               |
| `limiter.py`      | 速率限制                               |

### 2. `common/` — 公共层

存放所有领域共享的基类和通用组件，是领域层的基础。

```
common/
├── models.py          # SQLModel 基类（UUID7 主键、create_time、update_time）
├── crud.py            # BaseSQLModelCRUD[Model, Create, Update] 泛型基类
├── deps.py            # SessionDep、RedisDep 等共享依赖
└── schemas/
    ├── base.py        # BaseModel（camelCase 别名生成）
    ├── request.py     # BaseRequest（分页请求基类）
    └── response.py    # Response、PaginatedResponse 响应封装
```

**关键设计：**

- `SQLModel` 基类自动提供 `id`（UUID7）、`create_time`、`update_time` 字段
- `BaseSQLModelCRUD` 提供完整的泛型 CRUD 操作（分页、批量删除、条件查询等）
- `SessionDep` / `RedisDep` 通过 FastAPI 依赖注入提供数据库和缓存访问

### 3. `domains/` — 业务领域层

每个领域是一个自包含的业务模块，内部结构统一：

```
domains/<domain>/
├── __init__.py        # 包初始化
├── models.py          # 数据库模型（继承 common.models.SQLModel）
├── schemas.py         # 请求/响应 Schema（继承 common.schemas）
├── crud.py            # CRUD 操作（继承 common.crud.BaseSQLModelCRUD）
├── deps.py            # 领域级依赖项
├── services.py        # 业务逻辑（可选）
└── api.py             # API 路由定义
```

#### 当前领域

| 领域     | 说明                          | 核心模型          |
| -------- | ----------------------------- | ----------------- |
| `auth`   | 用户认证（登录、注册、Token） | `User`            |
| `role`   | 角色管理与权限校验            | `Role`            |
| `menu`   | 系统菜单与按钮权限            | `Menu`            |
| `router` | 接口路由（用于动态权限控制）  | `InterfaceRouter` |

## 依赖关系规则

```
core/  ←  common/  ←  domains/
 ↑                      ↑
 └──────────────────────┘
```

1. **`core/` 不依赖任何业务代码**（不 import common 或 domains）
2. **`common/` 只依赖 `core/`**（不 import domains）
3. **`domains/` 可以依赖 `core/` 和 `common/`**
4. **领域间可以互相依赖**，但应保持最小化（如 `role` 依赖 `auth` 的 `UserDBDep`）

## 请求处理流程

以「获取角色列表」为例：

```
客户端请求 GET /api/v1/roles
    │
    ▼
main.py → setup_router()    # 路由注册入口
    │
    ▼
domains/role/api.py         # router.get("") → get_roles()
    │
    ├─→ domains/role/deps.py    # verify_user_permission（权限校验依赖）
    ├─→ domains/role/services.py # filter_role()（构建过滤条件）
    └─→ domains/role/crud.py    # RoleCRUD.get_paginate()（数据库查询）
            │
            └─→ common/crud.py  # BaseSQLModelCRUD（泛型分页实现）
```

## 如何新增一个业务领域

以新增 `notification`（通知）领域为例：

### Step 1：创建领域目录

```bash
mkdir -p src/domains/notification
touch src/domains/notification/__init__.py
```

### Step 2：定义数据库模型

```python
# src/domains/notification/models.py
from sqlmodel import Field
from src.common.models import SQLModel
from src.utils.enums import Status

class Notification(SQLModel, table=True):
    __tablename__ = "notifications"

    title: str = Field(description="通知标题")
    content: str = Field(description="通知内容")
    status: Status = Field(default=Status.ON, description="状态")
```

### Step 3：定义 Schema

```python
# src/domains/notification/schemas.py
from src.common.schemas import BaseModel, BaseRequest, BaseResponse

class NotificationCreate(BaseModel):
    title: str
    content: str

class NotificationResponse(BaseResponse):
    title: str
    content: str
```

### Step 4：定义 CRUD

```python
# src/domains/notification/crud.py
from src.common.crud import BaseSQLModelCRUD
from .models import Notification
from .schemas import NotificationCreate

class NotificationCRUD(BaseSQLModelCRUD[Notification, NotificationCreate, NotificationCreate]):
    pass
```

### Step 5：定义依赖

```python
# src/domains/notification/deps.py
from typing import Annotated
from fastapi import Depends
from typing_extensions import Doc
from src.common.deps import SessionDep
from .crud import NotificationCRUD
from .models import Notification

async def get_notification_crud(session: SessionDep) -> NotificationCRUD:
    return NotificationCRUD(Notification, session=session)

NotificationCrudDep = Annotated[NotificationCRUD, Depends(get_notification_crud), Doc("...")]
```

### Step 6：定义 API 路由

```python
# src/domains/notification/api.py
from fastapi import APIRouter, Depends
from src.common.schemas.response import Response
from src.domains.role.deps import verify_user_permission
from .deps import NotificationCrudDep
from .schemas import NotificationCreate, NotificationResponse

router = APIRouter(
    prefix="/notifications",
    tags=["Notification"],
    dependencies=[Depends(verify_user_permission)],
)

@router.post("")
async def create_notification(body: NotificationCreate, crud: NotificationCrudDep) -> Response[NotificationResponse]:
    result = await crud.create(body)
    return Response(data=NotificationResponse.model_validate(result))
```

### Step 7：注册路由

在 `src/main.py` 的 `setup_router` 函数中添加：

```python
# src/main.py → setup_router()
from src.domains.notification import api as notification

v1_router.include_router(notification.router)
```

### Step 8：注册模型（供 Alembic 发现）

```python
# src/domains/__init__.py
from src.domains.notification.models import Notification
__all__ = [..., "Notification"]
```

## 为什么选择这个架构

### 对比扁平架构（Layer-first）

扁平架构按技术层级划分目录（`models/`、`schemas/`、`crud/`、`api/`），所有领域的同类文件混在一起：

```
# 扁平架构 — 修改"角色"功能需要跳转 5+ 个目录
models/role.py → schemas/role.py → crud/role.py → services/role.py → api/v1/roles.py
```

**问题：**

- 随着业务增长，每个目录内文件数线性膨胀
- 修改一个业务功能需要在多个目录间跳转
- 难以快速判断哪些文件属于同一业务

### 领域架构的优势

```
# 领域架构 — "角色"相关代码全部在一个目录
domains/role/  →  models.py, schemas.py, crud.py, services.py, api.py
```

| 优势         | 说明                                       |
| ------------ | ------------------------------------------ |
| **高内聚**   | 同一业务的所有代码集中在一个目录，一目了然 |
| **低耦合**   | 领域间依赖关系清晰，可独立开发和测试       |
| **易扩展**   | 新增业务只需复制目录结构，不影响现有代码   |
| **好导航**   | 找到领域目录就找到了所有相关文件           |
| **团队协作** | 不同开发者可以并行负责不同领域，减少冲突   |

## 技术栈速览

| 组件     | 技术                             |
| -------- | -------------------------------- |
| Web 框架 | FastAPI                          |
| ORM      | SQLModel + async SQLAlchemy      |
| 数据库   | PostgreSQL（通过 asyncpg）       |
| 缓存     | Redis（自封装 AsyncRedisClient） |
| 实时通信 | Socket.IO（fastapi-sio-di）      |
| 任务队列 | Celery                           |
| 主键策略 | UUID7（时间有序）                |
| 认证     | JWT（authlib）                   |
| 国际化   | 自定义 i18n 方案                 |
