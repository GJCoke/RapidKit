## ruff 配置与使用指南

::: warning 注意
当前 `ruff` 配置尚未集中在根目录，而是放置在各自的项目目录中，后续计划统一迁移至根目录管理。
:::

## 配置说明

项目中使用 **ruff** 对 Python 代码进行静态分析和格式规范检查，配置文件位于 `apps/backend/pyproject.toml` 中 `[tool.ruff]` 节点。关键配置如下：

- **line-length**: 120，最大行长度
- **target-version**: `"py312"`，目标 Python 版本
- **indent-width**: 4，缩进空格数

### Lint 配置 `[tool.ruff.lint]`

- **select**: 检查规则类型，包括 F（错误）、E（一般错误）、W（警告）、I001（信息性提示）
- **ignore**: 全局忽略规则，可根据项目需求配置
- **per-file-ignores**: 单文件忽略规则
- **dummy-variable-rgx**: 匹配临时变量模式，避免报错

### 排除目录 `[tool.ruff.exclude]`

- 常见依赖或构建产物目录，例如 `.git`、`.venv`、`build`、`dist`、`node_modules`
- IDE 配置目录：`.vscode`、`.idea`
- Python 缓存目录：`.mypy_cache`、`.pytest_cache`、`.ruff_cache`

### McCabe 循环复杂度

- **max-complexity**: 10，函数最大复杂度限制，超过提示警告

## 本地检查

- 对单个模块或整个项目执行 `ruff`，检查代码规范和潜在问题
- 可检测未使用变量、代码格式、逻辑错误、循环复杂度等
  ::: tabs
  == pnpm

```bash
pnpm format -F @monorepo-exmaple/backend
```

== ruff

```bash
cd apps/backend
ruff check --fix "src"
ruff format "src"
```

:::

## VSCode 集成

- 安装 **Ruff** 扩展
- 编辑器会自动识别 `pyproject.toml` 配置
- 实时高亮代码规范问题，提升开发体验

## 注意事项

- `exclude` 配置必须覆盖构建产物、虚拟环境和依赖目录，避免无意义检查
- `max-complexity` 可根据项目实际情况调整
