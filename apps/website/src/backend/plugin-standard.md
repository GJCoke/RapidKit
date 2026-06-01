# 插件模板化标准

本文档定义了创建 RapidKit 后端插件时必须遵循的目录结构、文件模板和注册流程，确保所有插件具备一致的开发体验和可维护性。

## 目录结构

每个插件位于 `apps/backend/plugins/<name>/`：

```text
plugins/<name>/
├── pyproject.toml                        # 包元数据 + Entry Point
├── src/plugin_<name>/
│   ├── __init__.py                       # register() → PluginManifest
│   ├── models.py                         # SQLModel ORM 表类
│   ├── schemas.py                        # Pydantic 请求/响应模型
│   ├── crud.py                           # BaseCRUD 子类
│   ├── services.py                       # 业务逻辑
│   ├── api.py                            # FastAPI 路由
│   ├── deps.py                           # Annotated 依赖注入类型
│   └── status_codes.py                   # 插件专属状态码 (可选)
├── migrations/
│   ├── __init__.py
│   └── versions/
│       └── __init__.py
└── tests/
    ├── __init__.py
    ├── conftest.py
    └── test_register.py
```

### 多域名插件

当插件涵盖多个子领域（如 Auth 包含认证、角色、菜单三个子域），每个子域独立成目录：

```text
plugins/auth/src/plugin_auth/
├── __init__.py
├── status_codes.py              # 插件级状态码（所有子域共用）
├── auth/
│   ├── models.py
│   ├── schemas.py
│   ├── crud.py
│   ├── services.py
│   ├── api.py
│   └── deps.py
├── role/
│   ├── models.py
│   ├── ...
└── router/
    ├── models.py
    └── ...
```

## register() 函数

每个插件的 `src/plugin_<name>/__init__.py` 必须导出 `register()` 函数：

```python
from rapidkit_core.plugin import PluginManifest


def register() -> PluginManifest:
    from plugin_hello.api import router
    from plugin_hello.models import HelloModel

    return PluginManifest(
        name="hello",
        version="0.1.0",
        router=router,
        models=[HelloModel],
    )
```

:::danger
Router 和 Model 的导入**必须**在 `register()` 函数内部，避免模块加载时产生循环导入。这是本项目中唯一允许函数内部导入的场景。
:::

### PluginManifest 完整字段

| 字段                    | 类型                     | 必填 | 说明                      |
| ----------------------- | ------------------------ | ---- | ------------------------- |
| `name`                  | `str`                    | 是   | 插件名，匹配目录名        |
| `version`               | `str`                    | 是   | PEP 440 语义化版本        |
| `router`                | `APIRouter`              | 是   | 插件路由                  |
| `models`                | `list[type]`             | 是   | SQLModel 表类列表         |
| `dependencies`          | `list[str]`              | 否   | 前置插件名列表            |
| `event_listeners`       | `list`                   | 否   | 跨插件事件监听器          |
| `on_startup`            | `list[Callable]`         | 否   | 启动回调                  |
| `on_shutdown`           | `list[Callable]`         | 否   | 关闭回调                  |
| `dependency_overrides`  | `dict`                   | 否   | 覆盖 FastAPI 依赖         |

## pyproject.toml 模板

```toml
[project]
name = "rapidkit-plugin-<name>"
version = "0.1.0"
description = "<插件描述>"
requires-python = ">=3.14"
dependencies = [
    "rapidkit-core",
    "rapidkit-common",
]

[project.entry-points."rapidkit.plugins"]
<name> = "plugin_<name>:register"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/plugin_<name>"]

[tool.pytest.ini_options]
asyncio_mode = "strict"
asyncio_default_fixture_loop_scope = "function"
```

:::info
`[project.entry-points."rapidkit.plugins"]` 是插件被框架自动发现的关键配置。框架通过 `importlib.metadata.entry_points(group="rapidkit.plugins")` 扫描所有已安装包的 Entry Point。
:::

## 工作区注册

新插件需要在两个 `pyproject.toml` 中注册：

### 根 pyproject.toml

```toml
[project]
dependencies = [
    # ...
    "rapidkit-plugin-<name>",
]

[tool.uv.sources]
rapidkit-plugin-<name> = { workspace = true }
```

### Backend pyproject.toml

```toml
[project]
dependencies = [
    # ...
    "rapidkit-plugin-<name>",
]

[tool.uv.sources]
rapidkit-plugin-<name> = { workspace = true }
```

:::tip
根目录 `pyproject.toml` 的 `[tool.uv.workspace].members` 使用 `apps/backend/plugins/*` 通配符，新插件目录会被自动纳入工作区。
:::

## Alembic 注册

### alembic.ini

在 `version_locations` 末尾追加插件迁移目录：

```ini
version_locations = alembic/versions:...:plugins/<name>/migrations/versions
```

### alembic/env.py

在 `PLUGIN_MODULES` 列表中添加插件包名：

```python
PLUGIN_MODULES: list[str] = [
    # ...
    "plugin_<name>",
]
```

## 状态码定义

如果插件需要自定义错误码，在 `status_codes.py` 中定义：

```python
"""
<Name> plugin status codes (plugin_id=XX).

6-digit format: XXTNNN
- T=2: business errors
- T=4: permission errors
- T=5: resource not found errors
"""

from rapidkit_framework.status_codes import BaseStatusCode


class MyPluginStatusCode(BaseStatusCode):
    """<Name> plugin error codes."""

    # Business errors (XX2xxx)
    SOMETHING_FAILED = (XX2001, "<name>.error.somethingFailed")
```

同时在 `apps/backend/src/locales/langs/{zh-CN,en-US}/` 下创建对应的 i18n JSON 文件。

详细规则参见 [错误处理与状态码](./error-handling.md)。

## 命名规范

| 对象                   | 规范                         | 示例                     |
| ---------------------- | ---------------------------- | ------------------------ |
| 插件目录名             | `kebab-case`                 | `plugins/my-plugin/`     |
| Python 包名            | `plugin_<snake_case>`        | `plugin_my_plugin`       |
| PyPI 包名              | `rapidkit-plugin-<kebab>`    | `rapidkit-plugin-my-plugin` |
| 数据库表名             | `{plugin}_{entity_plural}`   | `auth_users`, `worker_task_results` |
| Entry Point 名         | 与插件目录名相同             | `my-plugin`              |
| PluginManifest.name    | 与插件目录名相同             | `"my-plugin"`            |
| API 路由前缀           | `/{plural_entity}`           | `/users`, `/roles`       |
| 状态码枚举类名         | `{Plugin}StatusCode`         | `AuthStatusCode`         |

## 路由规范

```python
from fastapi import APIRouter, Depends
from rapidkit_common.auth import verify_user_permission

router = APIRouter(
    prefix="/entities",
    tags=["Entity"],
    dependencies=[Depends(verify_user_permission)],
)
```

- 路由前缀使用复数名词
- `tags` 用于 OpenAPI 文档分组
- 全局 `dependencies` 放认证校验，避免每个端点重复声明

## CRUD 规范

继承 `BaseCRUD` 并声明模型类型：

```python
from rapidkit_common.crud import BaseCRUD
from plugin_hello.models import HelloModel


class HelloCRUD(BaseCRUD[HelloModel]):
    pass
```

通过 `deps.py` 提供类型化依赖：

```python
from typing import Annotated

from fastapi import Depends
from rapidkit_common.deps import SessionDep

from plugin_hello.crud import HelloCRUD
from plugin_hello.models import HelloModel


async def get_hello_crud(session: SessionDep) -> HelloCRUD:
    return HelloCRUD(HelloModel, session)


HelloCrudDep = Annotated[HelloCRUD, Depends(get_hello_crud)]
```

## 数据库迁移

### 初始迁移

```bash
flux db migrate --plugin <name> -m "init"
flux db upgrade --plugin <name>
```

首次迁移自动使用 `--branch-label=<name> --head=base` 创建独立的 Alembic 分支。

### 后续迁移

```bash
flux db migrate --plugin <name> -m "add_field_xxx"
flux db upgrade --plugin <name>
```

:::warning
每个插件的迁移在独立的 Alembic 分支上，互不干扰。跨插件的数据依赖应通过事件总线或 UUID 外键实现，不要创建跨插件的 ForeignKey 约束。
:::

## 测试规范

### conftest.py

```python
import os

os.environ.setdefault("RAPIDKIT_ENV", "test")

from tests.testing.fixtures import *  # noqa: E402, F401, F403
```

### 注册测试

每个插件必须包含注册测试，验证 Manifest 基本字段：

```python
from plugin_hello import register


def test_register():
    manifest = register()
    assert manifest.name == "hello"
    assert manifest.version == "0.1.0"
    assert manifest.router is not None
    assert len(manifest.models) > 0
```

### 运行测试

```bash
# 运行单个插件的测试
uv run --package rapidkit-plugin-<name> pytest

# 运行全部后端测试
uv run pytest
```

## 条件启停

通过 `apps/backend/plugins.toml` 控制插件启停：

```toml
[plugins.<name>]
enabled = "${ENABLE_MY_PLUGIN:true}"
```

未在 `plugins.toml` 中声明的插件默认启用。

## 开发清单

创建新插件时的完整步骤：

- [ ] 创建目录结构（含 `migrations/versions/__init__.py`）
- [ ] 编写 `pyproject.toml`（含 Entry Point）
- [ ] 实现 `register()` 函数
- [ ] 注册到根 + Backend `pyproject.toml`
- [ ] 注册到 Alembic（`alembic.ini` + `env.py`）
- [ ] 运行 `uv sync` 安装
- [ ] 编写 Models、Schemas、CRUD、Services、API
- [ ] 定义状态码 + i18n 翻译（如需要）
- [ ] 生成初始迁移并执行
- [ ] 编写测试并验证通过
