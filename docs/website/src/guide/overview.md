## 目录结构概览

项目采用 **Monorepo 单仓库架构**，以「应用隔离、共享复用、配置统一」为核心原则，旨在提升协作效率、减少重复代码、实现标准化管理。

以下为更清晰、结构化的目录说明。

## 根目录核心配置

### 版本与变更管理

- **.changeset/**：用于多包版本统一管理。通过提交变更说明自动生成版本号与 CHANGELOG，避免手动管理出错。

### 质量保障工具

- **.cspell/**、**cspell.json**：拼写检查配置，涵盖代码、注释、文档，可自定义词库。
- **.husky/**：Git 钩子配置（如 pre-commit、commit-msg、pre-push），用于自动化 lint、格式化、提交校验与测试。
- **commitlint.config.ts**：约定式提交规范配置（如 feat、fix），用于统一提交信息格式。
- **eslint.config.ts**：ESLint 静态分析配置，统一语法规则与风格检查。
- **prettier.config.ts**：格式化配置，与 ESLint 配套保持代码风格一致。

### 全局依赖与构建

- **package.json**：定义 workspaces、全局依赖、共享脚本（如 turbo run build/dev）。
- **turbo.json**：Turborepo 核心任务编排配置（依赖关系、并行化、缓存策略等）。
- **tsconfig.json**：TypeScript 全局编译设置及路径别名配置。

## apps(可执行应用目录)

每个子项目皆为独立应用，可单独运行与部署：

- **backend/**：基于 FastAPI 的 Python 后端，提供 API、数据处理、权限校验等核心服务。
- **desktop/**：Electron 桌面端，基于前端技术构建跨平台客户端（Windows/macOS/Linux）。
- **frontend/**：Vue 3 + Vite 前端应用，包含路由、状态管理、HTTP 请求等完整 UI 系统。基于[Soybean Admin](https://docs.soybeanjs.cn/zh/)

## packages(共享功能模块)

面向 apps 提供通用能力，避免重复开发：

- **axios/**：基于 Axios 的请求封装（拦截器、超时、错误处理、Token 注入等）。
- **builder/**：构建辅助工具库（Rollup 配置片段、CI 脚本）。
- **utils/**：常用工具函数，覆盖字符串、数组、时间、数学、类型判断等通用场景。

## 辅助目录

- **docs/website/**：基于 VitePress 的静态文档站点，提供开发文档、部署指南、架构说明等内容。
- **scripts/**：存放 Node/Shell 脚本，执行环境变量注入、依赖更新、打包部署、日志清理等辅助任务。
