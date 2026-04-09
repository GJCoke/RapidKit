# 测试

## 后端测试：pytest

项目使用 [pytest](https://docs.pytest.org/) 作为后端测试框架，配合异步测试支持和覆盖率统计。

### pytest 配置

配置位于 `apps/backend/pyproject.toml` 的 `[tool.pytest.ini_options]` 段：

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
filterwarnings = [
    "ignore:The application is currently running in the local environment.*:RuntimeWarning",
    "ignore::pydantic.warnings.PydanticDeprecatedSince211"
]
```

| 配置项                                            | 说明                                                      |
| ------------------------------------------------- | --------------------------------------------------------- |
| `asyncio_mode = "auto"`                           | 自动识别异步测试函数，无需手动标注 `@pytest.mark.asyncio` |
| `asyncio_default_fixture_loop_scope = "function"` | 每个测试函数使用独立的事件循环，保证测试隔离              |
| `filterwarnings`                                  | 过滤开发环境和 Pydantic 弃用警告，减少测试输出噪音        |

### 技术栈

| 库               | 用途                            |
| ---------------- | ------------------------------- |
| `pytest`         | 测试框架                        |
| `pytest-asyncio` | 异步测试支持                    |
| `aiosqlite`      | 内存 SQLite 测试数据库          |
| `httpx`          | `AsyncClient` 进行 API 集成测试 |
| `asgi-lifespan`  | ASGI 应用生命周期管理           |
| `coverage`       | 代码覆盖率统计                  |

::: info 说明
测试使用 aiosqlite 内存数据库替代 PostgreSQL，无需启动外部数据库服务，测试执行速度快且环境隔离。
:::

### 运行命令

```bash
# 运行所有测试
uv run pytest

# 详细输出
uv run pytest -v

# 带覆盖率统计
uv run coverage run -m pytest
uv run coverage report

# 指定测试文件或目录
uv run pytest tests/test_auth.py
```

### 编写测试

由于 `asyncio_mode = "auto"`，异步测试函数会被自动识别，无需额外装饰器：

```python
async def test_create_user(client: AsyncClient):
    response = await client.post("/api/users", json={"name": "test"})
    assert response.status_code == 201
```

## 前端测试

::: warning 注意
前端测试框架尚未配置，计划引入 Vitest 进行单元测试和组件测试。目前前端代码质量主要通过 TypeScript 类型检查和 ESLint 静态分析保障。
:::

## 命令汇总

| 命令                            | 作用                 |
| ------------------------------- | -------------------- |
| `uv run pytest`                 | 运行后端测试         |
| `uv run pytest -v`              | 详细模式运行测试     |
| `uv run coverage run -m pytest` | 运行测试并收集覆盖率 |
| `uv run coverage report`        | 查看覆盖率报告       |
