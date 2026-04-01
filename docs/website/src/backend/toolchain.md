# 工具链

## 概览

| 工具   | 用途           | 配置位置                                   |
| ------ | -------------- | ------------------------------------------ |
| Ruff   | Lint + Format  | `pyproject.toml [tool.ruff]`               |
| mypy   | 静态类型检查   | `pyproject.toml [tool.mypy]`               |
| ty     | 下一代类型检查 | 独立运行                                   |
| pytest | 单元测试       | `pyproject.toml [tool.pytest.ini_options]` |

所有工具通过 `uv run` 执行，确保使用项目虚拟环境。Monorepo 层面通过 pnpm scripts 统一调用。

## Ruff

[Ruff](https://docs.astral.sh/ruff/) 是用 Rust 编写的高性能 Python Linter 和 Formatter，一个工具替代 flake8 + isort + black。

### 命令

```bash
# Lint 检查并自动修复
uv run ruff check --fix src

# 代码格式化
uv run ruff format src
```

Monorepo 统一命令：

```bash
pnpm --filter backend lint:format
```

### 配置

Ruff 配置在 `pyproject.toml` 的 `[tool.ruff]` 段。主要配置项包括规则选择、行宽限制、导入排序等。

### VS Code 集成

安装扩展 `charliermarsh.ruff`，保存时自动 Lint 和 Format。

:::info
Ruff 的执行速度比 flake8 + isort 快 10-100 倍，在大型代码库中优势明显。
:::

## mypy

[mypy](https://mypy.readthedocs.io/) 是 Python 的静态类型检查工具，在编译前发现类型错误。

### 命令

```bash
uv run mypy src
```

Monorepo 统一命令：

```bash
pnpm --filter backend lint:lint
```

### 配置

mypy 配置在 `pyproject.toml` 的 `[tool.mypy]` 段。项目启用严格模式，并为第三方库配置了针对性的 `per-module` 覆盖规则：

```toml
[tool.mypy]
strict = true

[[tool.mypy.overrides]]
module = ["celery.*", "socketio.*"]
ignore_missing_imports = true
```

:::warning
新增第三方库依赖时，如果该库缺少类型存根（py.typed），需要在 mypy overrides 中添加对应模块的 `ignore_missing_imports = true`。
:::

## ty

[ty](https://github.com/astral-sh/ty) 是 Astral 团队（Ruff 作者）开发的下一代 Python 类型检查器，使用 Rust 编写，速度极快。

### 命令

```bash
uv run ty check src
```

Monorepo 统一命令：

```bash
pnpm --filter backend typecheck
```

### ty 与 mypy 的关系

ty 和 mypy 是互补工具，各自有独到的检查能力：

- ty 对部分模式（如 `redis` 库返回 `Awaitable[T] | T` 联合类型）检查更严格
- mypy 在某些泛型和 Protocol 场景下更成熟

:::info
建议同时运行 ty 和 mypy。ty 能捕获 mypy 遗漏的问题，反之亦然。两者结合可获得最全面的类型安全保障。
:::

## pytest

项目使用 [pytest](https://docs.pytest.org/) 作为测试框架，配合异步测试支持。

### 配置

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
```

| 配置项                                            | 说明                                                      |
| ------------------------------------------------- | --------------------------------------------------------- |
| `asyncio_mode = "auto"`                           | 自动识别异步测试函数，无需手动标注 `@pytest.mark.asyncio` |
| `asyncio_default_fixture_loop_scope = "function"` | 每个测试函数使用独立的事件循环                            |

### 技术栈

| 库               | 用途                            |
| ---------------- | ------------------------------- |
| `pytest-asyncio` | 异步测试支持                    |
| `aiosqlite`      | 内存 SQLite 测试数据库          |
| `httpx`          | `AsyncClient` 进行 API 集成测试 |
| `coverage`       | 代码覆盖率统计                  |

### 命令

```bash
# 运行测试
uv run pytest

# 带覆盖率统计
uv run coverage run -m pytest
uv run coverage report
```

:::info
测试使用 aiosqlite 内存数据库替代 PostgreSQL，无需启动外部数据库服务，测试执行速度快且环境隔离。
:::

## 统一命令

Monorepo 通过 pnpm scripts 统一调用后端工具链命令：

| pnpm 命令                           | 底层命令                                                | 说明           |
| ----------------------------------- | ------------------------------------------------------- | -------------- |
| `pnpm --filter backend lint:format` | `uv run ruff check --fix src && uv run ruff format src` | Lint + Format  |
| `pnpm --filter backend lint:lint`   | `uv run mypy src`                                       | mypy 类型检查  |
| `pnpm --filter backend typecheck`   | `uv run ty check src`                                   | ty 类型检查    |
| `pnpm --filter backend dev`         | `uv run uvicorn ...`                                    | 启动开发服务器 |

:::warning
提交代码前建议依次运行 `lint:format`、`lint:lint` 和 `typecheck`，确保代码风格和类型安全性。
:::
