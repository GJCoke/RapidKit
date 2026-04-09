---
layout: home

hero:
  image: "/logo.svg"
  name: "RapidKit"
  text: "Full-Stack Monorepo Template"
  tagline: Vue 3 + FastAPI, TypeScript + Python, unified monorepo management
  actions:
    - theme: brand
      text: Get Started
      link: /guide/quickstart
    - theme: alt
      text: GitHub
      link: https://github.com/GJCoke/rapidkit

features:
  - title: Monorepo Architecture
    details: pnpm workspace + Turborepo + uv. Frontend, backend, shared packages, and docs unified in one repository.
  - title: Full-Stack Tech Stack
    details: Vue 3 + FastAPI, TypeScript + Python. Shared type definitions with automatic OpenAPI type generation.
  - title: RBAC Permission System
    details: Three-tier access control (route/API/button), dynamic menus, JWT dual-token auth, RSA encrypted transport.
  - title: Real-time Communication
    details: Socket.IO bidirectional communication, multi-namespace isolation, Redis adapter for multi-instance broadcasting.
  - title: Task Queue
    details: Celery async tasks + Beat scheduling + Worker monitoring, Redis Stream event consumption, WebSocket status push.
  - title: Containerized Deployment
    details: Docker multi-stage builds, dev/prod dual-mode Compose, dock CLI for one-click management, Docker and Podman support.
  - title: Developer Experience
    details: ESLint + Ruff + Prettier formatting, Husky + lint-staged commit checks, Changesets version management.
  - title: Internationalization
    details: Frontend Vue I18n + Backend Babel, type-safe i18n key auto-generation, middleware auto language detection.
---
