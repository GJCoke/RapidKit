## mypy 配置与使用指南

::: warning 注意
当前 `mypy` 配置尚未集中在根目录，而是放置在各自的项目目录中，后续计划统一迁移至根目录管理。
:::

## 配置说明

项目中使用 **mypy** 对 Python 代码进行静态类型检查，配置文件位于 `apps/backend/pyproject.toml` 中 `[tool.mypy]` 节点。关键配置如下：

- **plugins**: 使用 `pydantic.mypy` 插件对 Pydantic 模型进行类型检查
- **follow_imports**: 设置为 `"silent"`，表示不检查导入模块，仅检查当前模块
- **ignore_missing_imports**: 忽略缺失类型信息的导入模块，避免第三方库报错
- **warn_redundant_casts**: 开启类型转换冗余检查
- **check_untyped_defs**: 检查无类型注解的函数定义
- **no_implicit_reexport**: 防止隐式的模块 re-export
- **disallow_untyped_defs**: 不允许定义未标注类型的函数

### Pydantic 相关配置

- **init_forbid_extra**: 初始化模型时禁止额外字段
- **init_typed**: 确保字段类型在初始化时被类型检查
- **warn_required_dynamic_aliases**: 警告缺少动态别名的情况

## 本地检查

- 对单个模块或包执行类型检查，保证函数、类和 Pydantic 模型类型正确
- 支持检测未标注类型的函数、冗余类型转换和导入问题
  ::: tabs
  == pnpm

```bash
pnpm lint -F @monorepo-exmaple/backend
```

== mypy

```bash
cd apps/backend
mypy src
```

:::

## VSCode 集成

- 安装 **Python** 扩展
- 在编辑器中启用 `mypy` 检查
- 配置文件自动识别 `pyproject.toml` 中的 `[tool.mypy]`

## Git 提交自动格式化

项目启用了 **Husky + lint-staged**，会在提交前自动执行`mypy`检查。详情见 `.lintstagedrc.json`

## 注意事项

- Pydantic 模型强烈建议开启插件 `pydantic.mypy`
- 对于大型项目，可结合 Turborepo 或 Makefile 分模块执行检查
