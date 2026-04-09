# uv 包管理器

## 简介

[uv](https://docs.astral.sh/uv/) 是由 [Astral](https://astral.sh/) 团队使用 Rust 编写的新一代 Python 包和项目管理工具。它将 `pip`、`pip-tools`、`virtualenv`、`poetry` 等工具的功能整合到一个统一的命令行界面中，同时提供了极快的安装速度。

::: tip 为什么选择 uv
在本项目中，后端使用 uv 管理 Python 依赖。相比传统的 `pip` + `virtualenv` 或 `poetry` 方案，uv 在依赖解析和安装速度上有 10-100 倍的提升，且无需预先手动创建虚拟环境。
:::

## 安装

::: tabs
=== MacOS / Linux

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

如果没有 `curl`，也可以使用 `wget`：

```bash
wget -qO- https://astral.sh/uv/install.sh | sh
```

Homebrew 用户也可以通过 Homebrew 安装：

```bash
brew install uv
```

=== Windows

```bash
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

:::

安装完成后验证：

```bash
uv --version
```

## Python 版本管理

本项目要求 Python >= 3.14（见 `apps/backend/pyproject.toml` 中的 `requires-python`）。uv 可以直接安装和管理 Python 版本，无需借助 `pyenv` 等第三方工具：

```bash
uv python install 3.14
```

查看已安装的 Python 版本：

```bash
uv python list
```

## 虚拟环境

uv 在执行 `uv sync` 或 `uv run` 时会自动在项目根目录下创建 `.venv/` 虚拟环境，无需手动执行 `python -m venv`。该目录已被 `.gitignore` 忽略。

::: info 说明
uv 会根据 `pyproject.toml` 中的 `requires-python` 自动选择合适的 Python 版本来创建虚拟环境。如果本地没有符合要求的版本，uv 会提示你安装。
:::

## 常用命令

以下命令均在 `apps/backend/` 目录下执行：

| 命令                     | 说明                                                           |
| ------------------------ | -------------------------------------------------------------- |
| `uv sync`                | 根据 `uv.lock` 安装所有依赖（含开发依赖），并自动创建 `.venv/` |
| `uv run <command>`       | 在虚拟环境中执行命令，例如 `uv run uvicorn src.main:app`       |
| `uv add <package>`       | 添加生产依赖并更新 `pyproject.toml` 和 `uv.lock`               |
| `uv add --dev <package>` | 添加开发依赖到 `[dependency-groups] dev`                       |
| `uv lock`                | 仅更新 `uv.lock` 锁文件，不安装依赖                            |
| `uv pip list`            | 查看当前虚拟环境中已安装的包                                   |

::: warning 注意
请始终使用 `uv run` 而非直接激活虚拟环境后运行命令。`uv run` 会确保环境与锁文件保持同步。
:::

## 与 pip / poetry 的对比

| 特性            | pip + venv        | poetry      | uv               |
| --------------- | ----------------- | ----------- | ---------------- |
| 安装速度        | 慢                | 中等        | 极快 (Rust 实现) |
| 虚拟环境管理    | 手动创建          | 自动创建    | 自动创建         |
| 锁文件          | 无 (需 pip-tools) | poetry.lock | uv.lock          |
| Python 版本管理 | 不支持            | 不支持      | 内置支持         |
| 依赖解析        | 较慢              | 中等        | 极快             |

## 常见问题

### 网络代理 / 镜像源

如果在国内网络环境下安装依赖较慢，可以通过环境变量指定镜像源：

```bash
export UV_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
uv sync
```

也可以在 `pyproject.toml` 中配置持久化的镜像源：

```toml
[[tool.uv.index]]
url = "https://mirrors.aliyun.com/pypi/simple/"
```

### 清理缓存

uv 会在本地缓存已下载的包以加速后续安装。如果遇到缓存相关的问题，可以清理：

```bash
uv cache clean
```

### 锁文件冲突

多人协作时 `uv.lock` 可能产生合并冲突。解决方法是保留任意一方的版本，然后重新生成：

```bash
uv lock
```
