# 代码风格

本项目前端使用 **ESLint + Prettier**，后端使用 **Ruff**，统一管理代码风格与格式化。

## 前端：ESLint

项目采用 ESLint 9+ Flat Config 格式（`eslint.config.ts`），集成 TypeScript、Vue 3 和 Prettier 支持。

### 配置结构

| 配置区域      | 适用范围                                     | 主要功能                               |
| ------------- | -------------------------------------------- | -------------------------------------- |
| 通用规则      | 所有 JS/TS 文件                              | TypeScript 基础检查、Prettier 格式集成 |
| Vue3 前端     | `apps/frontend/**`、`packages/components/**` | Vue SFC 解析、浏览器全局变量           |
| Electron/Node | `apps/desktop/**`                            | Node 全局变量                          |

### 关键规则

```ts
rules: {
  "no-var": "error",        // 禁止使用 var，强制 let/const
  eqeqeq: "error",          // 必须使用 === / !==
  "prefer-const": "error",  // 优先使用 const
}
```

::: info 说明
`no-undef` 被关闭，因为 TypeScript 会执行更准确的未定义变量检查，ESLint 的该规则会造成误报。
:::

### Vue 组件命名

Vue 配置使用 `vue-eslint-parser` 解析 SFC 模板，内部 `<script>` 由 TypeScript 解析器处理。组件命名规则允许 `index.vue`、
`App.vue` 等单词文件名。

### 运行命令

```bash
# 全项目检查
pnpm check:lint

# 指定子项目
pnpm lint -F @rapidkit/frontend
```

## 前端：Prettier

Prettier 负责代码格式化，与 ESLint 通过 `eslint-config-prettier` 解决规则冲突。

### 核心配置

| 配置项                    | 值    | 说明                        |
| ------------------------- | ----- | --------------------------- |
| `printWidth`              | 120   | 单行最大字符数              |
| `tabWidth`                | 2     | 缩进空格数                  |
| `semi`                    | false | 不添加行尾分号              |
| `singleQuote`             | false | 使用双引号                  |
| `trailingComma`           | "all" | 多行结构末尾添加逗号        |
| `endOfLine`               | "lf"  | 统一 LF 换行符              |
| `vueIndentScriptAndStyle` | true  | Vue SFC script/style 内缩进 |

### 运行命令

```bash
# 格式化全项目
pnpm check:format

# 仅检查不修改
pnpm prettier --check .
```

## 后端：Ruff

[Ruff](https://docs.astral.sh/ruff/) 是用 Rust 编写的高性能 Python Linter + Formatter，替代 flake8 + isort +
black。配置位于根目录 `pyproject.toml` 的 `[tool.ruff]` 段。

### 核心配置

| 配置项           | 值    | 说明                  |
| ---------------- | ----- | --------------------- |
| `line-length`    | 120   | 最大行长度            |
| `target-version` | py312 | 目标 Python 版本      |
| `indent-width`   | 4     | 缩进空格数            |
| `max-complexity` | 10    | McCabe 循环复杂度上限 |

### Lint 规则

| 规则代码  | 含义                                 |
| --------- | ------------------------------------ |
| `F`       | Pyflakes -- 未使用变量、未定义名称等 |
| `E` / `W` | pycodestyle 错误与警告               |
| `I001`    | isort -- 导入排序                    |

### 运行命令

```bash
# Lint 检查并自动修复
uv run ruff check --fix src

# 代码格式化
uv run ruff format src

# Monorepo 统一命令
pnpm --filter backend format
```

## IDE 集成

::: tip VS Code 推荐配置

1. 安装 **Prettier - Code Formatter** 和 **ESLint** 插件（前端）
2. 安装 **Ruff** 插件（后端）
3. 在 `.vscode/settings.json` 中启用保存时格式化：

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode"
}
```

:::

## 命令汇总

| 命令                           | 作用               |
| ------------------------------ | ------------------ |
| `pnpm check:lint`              | ESLint 检查        |
| `pnpm check:format`            | Prettier 格式化    |
| `uv run ruff check --fix src`  | Ruff Lint 检查     |
| `uv run ruff format src`       | Ruff 格式化        |
| `pnpm --filter backend format` | 后端 Lint + Format |
