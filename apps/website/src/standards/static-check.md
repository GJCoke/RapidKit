# 静态检查

本项目使用多种静态分析工具保证代码质量：前端通过 **TypeScript** 类型检查，后端通过 **mypy** 和 **ty** 双重类型检查，全项目通过
**cSpell** 拼写检查。

## TypeScript 类型检查

### tsconfig 层级结构

项目采用分层 tsconfig 配置：

- **根目录 `tsconfig.json`** -- 定义全局配置（`strict`、`target`、`module`、`paths` 等）
- **子项目 `tsconfig.json`** -- 通过 `extends` 继承根配置，可针对本项目覆盖部分选项

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "outDir": "dist" },
  "include": ["src"]
}
```

### Turborepo 并行检查

项目通过 Turborepo 调度各子项目的类型检查任务，执行 `tsc --noEmit`（仅检查类型，不输出编译文件）。Turborepo
的缓存机制会跳过无代码变更的子项目，提升 CI/CD 效率。

### 运行命令

```bash
# 全项目类型检查（Turborepo 并行）
pnpm check:types

# 指定子项目
pnpm typecheck -F @rapidkit/frontend
```

::: info 说明
pre-push Hook 会自动执行 `pnpm check:types`，阻止类型错误的代码推送到远程仓库。
:::

## mypy（Python 类型检查）

[mypy](https://mypy.readthedocs.io/) 是 Python 的静态类型检查工具，配置位于 `apps/backend/pyproject.toml` 的
`[tool.mypy]` 段。

### 核心配置

| 配置项                   | 说明                           |
| ------------------------ | ------------------------------ |
| `plugins: pydantic.mypy` | 启用 Pydantic 模型类型检查插件 |
| `strict: true`           | 启用严格模式                   |
| `check_untyped_defs`     | 检查无类型注解的函数定义       |
| `disallow_untyped_defs`  | 不允许定义未标注类型的函数     |
| `warn_redundant_casts`   | 警告冗余类型转换               |
| `no_implicit_reexport`   | 防止隐式模块 re-export         |

::: warning 注意
新增第三方库依赖时，如果该库缺少类型存根（py.typed），需要在 mypy overrides 中添加对应模块的
`ignore_missing_imports = true`。
:::

### 运行命令

```bash
# 直接执行
uv run mypy src

# Monorepo 统一命令
pnpm --filter backend lint
```

## ty（下一代 Python 类型检查）

[ty](https://github.com/astral-sh/ty) 是 Astral 团队（Ruff 作者）开发的下一代 Python 类型检查器，使用 Rust 编写，速度极快。配置位于根目录
`pyproject.toml` 的 `[tool.ty]` 段。

### ty 与 mypy 的关系

ty 和 mypy 是互补工具：

- ty 对部分模式（如联合类型 `Awaitable[T] | T`）检查更严格
- mypy 在泛型和 Protocol 场景下更成熟

::: info 说明
建议同时运行 ty 和 mypy。两者结合可获得最全面的类型安全保障。lint-staged 已自动对 `*.py` 文件执行 ty 检查。
:::

### 运行命令

```bash
# 直接执行
uv run ty check src

# Monorepo 统一命令
pnpm --filter backend typecheck
```

## cSpell 拼写检查

项目使用 [cSpell](https://cspell.org/) 对代码、文档和配置文件进行拼写检查，配置文件为根目录的 `cspell.json`。

### 配置要点

- **import** -- 引入 TypeScript 和 Python 外部字典
- **words** -- 自定义单词列表（项目名、缩写、工具名等）
- **ignorePaths** -- 排除 `node_modules`、`dist`、`.venv` 等目录
- **自定义字典** -- `.cspell/custom-dictionary.txt`，支持自动添加新单词

### 运行命令

```bash
pnpm check:spell
```

## 命令汇总

| 工具       | 命令                              | 作用                             |
| ---------- | --------------------------------- | -------------------------------- |
| TypeScript | `pnpm check:types`                | 全项目类型检查（Turborepo 并行） |
| mypy       | `uv run mypy src`                 | Python 类型检查                  |
| mypy       | `pnpm --filter backend lint`      | Monorepo 统一命令                |
| ty         | `uv run ty check src`             | 下一代 Python 类型检查           |
| ty         | `pnpm --filter backend typecheck` | Monorepo 统一命令                |
| cSpell     | `pnpm check:spell`                | 拼写检查                         |

::: warning 注意
提交代码前建议依次运行 `check:format`、`check:lint` 和 `check:types`，确保代码风格和类型安全性。实际上 Husky Hooks
已自动覆盖这些检查，但手动运行有助于提前发现问题。
:::
