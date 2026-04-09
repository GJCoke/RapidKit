# 项目介绍

## 概述

本项目是一个基于 **Vue 3 + FastAPI** 的现代化全栈 Monorepo 应用模板，采用 **pnpm Workspaces + Turborepo** 进行多项目统一管理，将前端、后端、桌面端和文档系统集中在同一仓库中，实现代码复用最大化、协作效率最优化、部署流程标准化。

项目适用于需要同时维护 Web 前端、Python 后端、Electron 桌面端的中大型团队，提供开箱即用的工程化基础设施。

## 技术栈

| 类别      | 技术                    | 说明                             |
| --------- | ----------------------- | -------------------------------- |
| 前端框架  | Vue 3 + Composition API | 基于 SoybeanAdmin 的 SPA 应用    |
| 构建工具  | Vite                    | 极速开发服务器与生产构建         |
| 类型系统  | TypeScript              | 全栈类型安全                     |
| UI 组件库 | Naive UI                | 高质量 Vue 3 组件库              |
| 后端框架  | FastAPI                 | 高性能异步 Python API 框架       |
| 数据库    | PostgreSQL              | 关系型数据存储                   |
| 缓存      | Redis                   | 缓存、会话管理、消息代理         |
| 任务队列  | Celery                  | 分布式异步任务队列               |
| 实时通信  | Socket.IO               | 基于 WebSocket 的双向实时通信    |
| 桌面端    | Electron                | 基于前端代码的跨平台桌面应用     |
| 文档      | VitePress               | 基于 Markdown 的静态文档站点     |
| 包管理    | pnpm                    | 严格依赖隔离的 Monorepo 包管理器 |
| 构建编排  | Turborepo               | 多项目并行构建与缓存加速         |

## 核心特性

### 工程化

- **Monorepo 架构** -- pnpm Workspaces 管理多项目，Turborepo 编排构建任务，支持缓存与并行执行
- **端到端类型安全** -- 后端 FastAPI 自动生成 OpenAPI 规范，前端通过 openapi-typescript 生成 TypeScript 类型，确保前后端契约一致
- **统一代码规范** -- ESLint + Prettier 管理前端代码风格，mypy + ruff 管理后端代码质量，Husky + commitlint 统一提交规范

### 功能模块

- **RBAC 权限管理** -- 基于角色的细粒度权限控制，支持菜单权限、按钮权限、API 权限
- **国际化 (i18n)** -- 前端 Vue I18n 多语言支持，后端 API 响应国际化，翻译键自动生成 TypeScript 类型
- **实时通信** -- 基于 Socket.IO 的 WebSocket 双向通信，支持事件推送与在线状态管理
- **任务队列** -- Celery + Redis 实现异步任务调度，支持定时任务 (Beat)、Worker 监控与管理
- **代码执行沙箱** -- 集成 Monaco Editor 的在线代码编辑器，支持安全的代码执行与输出展示
- **容器化部署** -- Docker 多阶段构建，Nginx 反向代理，支持开发与生产环境一键部署

### 共享复用

- **共享工具库** -- 通用工具函数、HTTP 请求封装、Vue Hooks、颜色管理等模块，多应用复用
- **统一构建配置** -- Rollup / Vite 构建配置集中管理，避免重复配置

## 文档面向的读者

本文档面向以下读者：

- 希望快速上手本项目的开发者
- 需要了解项目架构与设计决策的技术负责人
- 希望参考全栈 Monorepo 实践的工程师

::: tip 提示
如果你是第一次接触本项目，建议按照 [快速开始](./quickstart.md) 完成环境搭建后，再阅读 [架构设计](./design.md) 了解整体设计。
:::

## 文档导航

- [快速开始](./quickstart.md) -- 环境准备、依赖安装、项目启动
- [目录结构](./directory.md) -- Monorepo 仓库目录说明
- [架构设计](./design.md) -- 整体架构、设计原则与技术链路
- [前端开发](/frontend/tech-stack) -- Vue 3 前端应用开发指南
- [后端开发](/backend/tech-stack) -- FastAPI 后端服务开发指南
