---
layout: home

hero:
  image: "/logo.svg"
  name: "RapidKit"
  text: "全栈 Monorepo 模板"
  tagline: Vue 3 + FastAPI, TypeScript + Python, 多端统一管理
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/quickstart
    - theme: alt
      text: GitHub
      link: https://github.com/GJCoke/rapidkit

features:
  - title: Monorepo 架构
    details: pnpm workspace + Turborepo + uv，前后端、共享包、文档站统一管理，依赖拓扑自动编排。
  - title: 全栈技术栈
    details: Vue 3 + FastAPI，TypeScript + Python 双语言协同，共享类型定义，OpenAPI 自动生成前端类型。
  - title: RBAC 权限体系
    details: 三级权限控制（路由/接口/按钮），动态菜单，JWT 双 Token 认证，RSA 加密传输。
  - title: 实时通信
    details: Socket.IO 双向通信，多命名空间隔离，Redis 适配器支持多实例广播，JWT 连接认证。
  - title: 任务队列
    details: Celery 异步任务 + Beat 定时调度 + Worker 实时监控，Redis Stream 事件消费，WebSocket 状态推送。
  - title: 容器化部署
    details: Docker 多阶段构建，开发/生产双模式 Compose，dock CLI 一键管理，支持 Docker 和 Podman。
  - title: 开发体验
    details: ESLint + Ruff + Prettier 代码格式化，Husky + lint-staged 提交检查，Changesets 版本管理。
  - title: 国际化
    details: 前端 Vue I18n + 后端 Babel，类型安全的 i18n key 自动生成，中间件自动语言检测。
---
