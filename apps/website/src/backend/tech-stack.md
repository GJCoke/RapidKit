# Backend

基于 FastAPI 的全栈后端服务，提供认证、权限、实时通信、任务队列、代码执行等能力。

## 技术栈

| 类别     | 技术                            |
| -------- | ------------------------------- |
| Web 框架 | FastAPI + Uvicorn               |
| ORM      | SQLModel + async SQLAlchemy     |
| 数据库   | PostgreSQL（asyncpg / psycopg） |
| 缓存     | Redis                           |
| 对象存储 | MinIO                           |
| 任务队列 | Celery                          |
| 实时通信 | python-socketio                 |
| 认证     | JWT (HS256) + RSA 加密          |
| 国际化   | Babel                           |
| 日志     | Loguru                          |

## 核心特性

- **插件化架构** — 业务代码以独立 workspace 包组织，基础设施抽取到 `rapidkit-core` 和 `rapidkit-common`
- **RBAC 三级权限** — 路由权限、接口权限、按钮权限，控制前后端全链路访问
- **双语国际化** — 基于 Babel 的中英文支持，中间件自动识别语言偏好
- **WebSocket 实时推送** — python-socketio 挂载为 ASGI 中间件，支持多命名空间
- **Celery 异步任务** — 任务队列 + 事件消费 + Worker 监控 + WebSocket 状态推送
- **代码执行沙箱** — 支持 Python / JavaScript / Shell 脚本在线执行，带超时和审计日志
- **OpenAPI 自动文档** — 开发环境下自动生成 Swagger UI 和 ReDoc

## 项目结构

```
rapidkit/
├── packages/
│   ├── core/              # rapidkit-core（基础设施）
│   └── common/            # rapidkit-common（公共层）
├── apps/backend/
│   ├── src/               # 应用入口、中间件、Socket.IO、Celery 队列
│   ├── plugins/           # 业务插件（每个是独立的 uv workspace 包）
│   │   ├── auth/          #   认证 + 角色 + 接口路由
│   │   ├── user/          #   用户管理
│   │   ├── menu/          #   菜单 + 前端路由
│   │   ├── script/        #   脚本管理与执行
│   │   ├── monitoring/    #   API 监控
│   │   ├── system/        #   系统活动日志
│   │   ├── worker/        #   Celery Worker 监控
│   │   └── schedule/      #   定时任务调度
│   ├── alembic/           # 数据库迁移
│   └── tests/             # 集成测试
```

每个插件包含 `api.py`（路由）、`models.py`（数据模型）、`schemas.py`（请求/响应 Schema）、`crud.py`（数据操作）、`deps.py`（依赖注入）、`services.py`（业务逻辑）。

更多架构细节参见 [架构说明](./architecture.md)。

## 下一步

前往 [首次部署](./quickstart.md) 了解如何在本地搭建开发环境。
