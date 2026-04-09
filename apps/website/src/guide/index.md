## 项目概述

本项目是一个现代化的 **全栈、多端一体化应用工程**，采用 **Monorepo** 组织形式，将前端、后端、桌面端和文档系统集中在同一仓库中统一管理。

- 前端使用 **Vue.js + TypeScript** 构建 SPA
- 桌面端基于 **Electron** 封装前端实现跨平台桌面应用
- 后端使用 **Python + FastAPI** 提供高性能 RESTful API
- 文档系统采用 **VitePress** 构建静态站点

项目通过 **pnpm** 管理依赖、**Turborepo** 加速构建，并集成 **Docker**、静态检查、类型自动生成、提交规范等工具链，打造端到端一体化开发体验。

## 项目简介

项目目标是构建一个 **统一管理、类型安全、自动化程度高的全栈应用框架**。

采用 Monorepo 架构后，可实现：

- **组件/工具库共享**
- **类型定义共享（前后端一致）**
- **依赖统一管理**
- **跨团队协作统一标准**
- **更高的构建效率（Turborepo 缓存）**

配合现代技术栈（TypeScript、Vue、Electron、FastAPI 等）和严格的静态检查体系，使项目具备快速迭代能力和高可靠性。

## 项目目标与设计理念

### 1. 统一开发体验

- 通过 Monorepo 集成所有模块，避免在多个仓库之间切换。
- 使用 pnpm 的严格依赖模式，杜绝“幽灵依赖”。
- 共享 UI 组件、工具函数、类型定义等，提高复用率。

### 2. 代码共享与协同

- 通过自动生成 OpenAPI TypeScript 类型实现**端到端契约一致性**。
- Vue I18n 的翻译键自动生成 TS 类型，避免国际化键名写错。
- 前后端共享数据模型与核心逻辑。

### 3. 高效构建与测试

- Turborepo 提供缓存、并行构建、增量构建。
- 大规模项目下显著减少构建/测试时间。

### 4. 类型安全优先

- 前端：Vue + TypeScript + vue-tsc
- 后端：FastAPI + Pydantic + mypy
- 在编译阶段发现大多数错误，减少运行时问题。

### 5. 自动化与规范化

- 使用 Changesets 管理多包版本 & Changelog。
- Git 提交阶段通过 Husky、lint-staged、commitlint 自动执行规范检查。

## 技术架构

### Web 前端（Vue + TypeScript）

- 基于 Vue 3 + Composition API 构建 SPA
- 使用 TS 提供类型安全与 IDE 智能提示
- 支持国际化、路由、全局状态管理等模块化设计

### 桌面应用（Electron + Vue）

- 复用 Web 代码，打包成跨平台桌面应用
- 通过 Node.js API 访问系统能力
- 可使用 Electron Forge 等工具进行自动构建与更新

### 后端服务（Python + FastAPI）

- 高性能异步 API 框架
- 自动生成 OpenAPI 规范
- 使用 Pydantic 进行数据验证
- 静态检查工具：mypy、ruff

### 共享库与工具

- 共享 TypeScript 类型、工具函数、UI 组件等
- 使用 openapi-typescript 自动生成 API 客户端类型
- 实现前后端统一的数据结构和响应格式

### 文档系统（VitePress）

- 基于 Markdown 编写文档
- 支持 Vue 组件、主题扩展、搜索
- 支持多语言文档（如 `en/`、`jp/`）

## 技术选型说明

#### TypeScript

- 静态类型提升安全性和可维护性
- 与 Vue 3 完全兼容

#### Vue 3

- Composition API 带来更灵活的逻辑复用
- 强大的生态与官方 TS 支持

#### Electron

- 使用 Web 技术直接构建桌面应用
- Node.js + Chromium 提供一致的跨平台体验

#### Python + FastAPI

- 类型驱动 API 设计
- 内置自动文档和高性能 async 支持

#### pnpm

- 符号链接 + 内容可寻址存储
- Monorepo 场景下依赖隔离更强

#### Turborepo

- 多项目构建缓存
- 并行执行任务，加速 CI/CD

#### 代码检查工具

- 前端：ESLint、Prettier
- 后端：mypy、ruff
- 文档/注释拼写检查：cSpell

#### 提交与版本管理

- Commitlint 校验提交规范
- Husky + lint-staged 自动执行检查
- Changesets 管理多包版本升级流程

## 工具链与开发体验

### 静态检查

- vue-tsc / tsc 进行 TS 类型检查
- ESLint + Prettier 保持前端代码质量
- mypy + ruff 保证后端代码稳定

### 类型生成

- 使用 FastAPI 生成 OpenAPI
- openapi-typescript 自动生成 TS 客户端类型
- Vue I18n 翻译键自动生成类型声明

### Git 提交与分支管理

- Git Flow 或 trunk-based workflow
- 提交前自动运行 lint / format / type-check
- CI 阶段强制通过检查后才允许合并

### 版本发布

- 使用 Changesets 自动管理版本变更与 Changelog
- 适用于多包 Monorepo 发布

## 部署与发布

### 容器化部署

- 各模块构建独立 Docker 镜像
- 前端/文档以静态资源方式部署，后端作为 API 服务运行
- 使用 Nginx 做反向代理

### 多阶段构建

- 使用 pnpm/Turborepo 在构建阶段构建产物
- 运行阶段使用更小的镜像减少体积

### 环境区分

- `.env`
- `.env.production`
- `.env.test`

### CI/CD

- 自动构建镜像并运行测试
- 推送容器到注册表，自动部署到服务器或 Kubernetes

## 文档支持

- 使用 VitePress 构建文档站点
- 文档支持热更新、代码高亮、搜索、Vue 组件
- 多语言结构清晰（如 `en/`, `jp/`）
- 文档构建可并入 CI 自动发布流程
- Changesets 生成的 Changelog 会同步纳入文档

## 参考文献

本项目架构和设计思路参考了业内关于 Monorepo、Turborepo、高性能前后端开发和文档构建的最佳实践。

- [Monorepos with Turborepo](https://medium.com/@ignatovich.dm/monorepos-with-turborepo-6aa0852708ee)
- [Turborepo](https://turborepo.com/docs)
- [FastAPI: The Modern Python Web Framework That Bridges Performance and Simplicity](https://medium.com/codex/fastapi-the-modern-python-web-framework-that-bridges-performance-and-simplicity-cfc4ab807418)
- [OpenAPI TypeScript](https://openapi-ts.dev/)
- [VitePress](https://vitepress.dev/)
- [Electron](https://www.electronjs.org/#:~:text=Powered%20by%20the%20web)
- [Pnpm](https://pnpm.io/workspaces)
