## ESLint 配置与使用文档

本文档基于当前项目的 `eslint.config.ts`（flat config）编写，适用于包含 **通用项目、Vue 前端、Electron/Node 后端** 的 Monorepo 工程结构。

## 概述

本项目采用 **ESLint Flat Config（ESLint 9+ 新版配置格式）**，集成：

- **TypeScript 支持（typescript-eslint）**
- **Vue 3 支持（eslint-plugin-vue）**
- **Prettier 格式集成（eslint-plugin-prettier + eslint-config-prettier）**
- **浏览器 / Node 全局变量配置**
- **为 Monorepo 分模块配置（frontend / desktop / 通用）**

通过分区配置，可以让前端与后端模块拥有不同的 ESLint 功能与检查规则。

## ESLint 配置文件说明

### 1. 通用规则配置

适用于所有 JS/TS 代码（包括后端与前端）。

主要包含：

- TypeScript 基础检查
- Prettier 关闭 ESLint 与格式冲突
- 基础语法规则（如 no-var、eqeqeq）
- 全项目忽略文件规则

#### 功能说明

- 禁止使用 var：强制使用 let / const
- 强制使用 === / !==
- 关闭 no-undef（因为 TypeScript 会做该检查）
- 关闭大量与 TypeScript 重复的规则

### 2. Vue3 前端配置

适用于：
`apps/frontend/**/*.{ts,js,tsx,jsx,vue}`
`packages/components/**/*.{ts,js,tsx,jsx,vue}`

主要功能：

- Vue 单文件组件解析（vue-eslint-parser）
- Vue 官方推荐规则（flat/recommended）
- 浏览器端全局变量（window、document 等）
- Vue 组件命名规则调整（允许 index.vue / App.vue 等文件）

#### 特别说明：Vue SFC 解析

```ts
parser: vueParser,
parserOptions: { parser: tsESLint.parser }
```

这里采用 **Vue 模板解析器负责解析 SFC**，内部 script 部分交由 TypeScript 解析器处理。

### 3. Electron / Node 后端配置

适用于：
`apps/desktop/**/*.{ts,js}`

功能：

- 自动加入 Node 环境全局变量
- 关闭浏览器特性规则影响

## 忽略规则（ignores）

默认忽略：

```text
dist/
release/
node_modules/
scripts/
*.d.ts
*.log
*.md
.vitepress/cache
.venv/
```

保证 ESLint 不会检查构建产物、依赖包、文档等。

## 执行 ESLint 检查

```bash
pnpm lint:lint
```

或指定单独的应用：

```bash
pnpm lint:lint -F @monorepo-exmaple/frontend
```

## 在 VSCode 中启用ESLint

1. 安装 **ESLint** 插件
2. 在 `.vscode/settings.json` 中加入：

```json
{
  "eslint.validate": [
    "html",
    "css",
    "scss",
    "json",
    "jsonc",
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact",
    "vue"
  ],
  "eslint.alwaysShowStatus": true,
  "eslint.format.enable": false
}
```

## Git 提交自动检查

项目启用了 **Husky + lint-staged**，会在提交前自动执行`ESLint`检查。详情见 `.lintstagedrc.json`

## 常见问题与解决

**为什么 no-undef 被关闭？**

因为 TypeScript 会做更准确的未定义变量检查，ESLint 的这条规则会造成误报，所以禁用了。

**Vue .vue 文件为什么能够正确识别 TypeScript？**
因为：

- 顶层使用 vue-eslint-parser 解析 .vue
- 内部 script 使用 TypeScript 解析器（tsESLint.parser）
  这是正确的双解析器组合。

**为什么组件名字可以用 index.vue？**
因为添加了：

```ts
"vue/multi-word-component-names": [
  "warn",
  {
    ignores: ["index", "App", "Register", "[id]", "[url]"]
  }
]
```

非常适合基于文件路由的项目。
