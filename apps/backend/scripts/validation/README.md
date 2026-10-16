# 用户模拟身份：真实 Celery 链路验收

`impersonation_celery_acceptance.py` 是显式启用的验收工具，不被生产任务自动发现。它使用真实HTTP、Redis broker/result backend、prefork Worker、Redis Stream消费者和项目 `AsyncDatabaseScheduler`。

**仅使用可丢弃的专用服务。** 脚本会重建 PostgreSQL `127.0.0.1:15432/test` 的模型表，清空 Redis `127.0.0.1:16379` 的DB0/DB1；必须显式设置 `RAPIDKIT_CELERY_ACCEPTANCE=1` 才允许执行。不得将已有开发服务映射到这两个端点。

容器使用已有镜像创建，示例值仅供测试：

```sh
docker run -d --name codex-impersonation-celery-pg -p 127.0.0.1:15432:5432 \
  -e POSTGRESQL_USERNAME=test -e POSTGRESQL_PASSWORD=test \
  -e POSTGRESQL_DATABASE=test -e POSTGRESQL_POSTGRES_PASSWORD=test bitnami/postgresql:latest
docker run -d --name codex-impersonation-celery-redis -p 127.0.0.1:16379:6379 \
  redis:7-alpine redis-server --requirepass test
```

在已安装工作区Python依赖的环境中，从 `apps/backend` 执行。`ACCEPTANCE_PYTHON` 指向该环境的Python可执行文件，所有子进程继承相同配置；本次实际执行通过 `/tmp/rapidkit-impersonation-python` 包装器显式选择工作树源码。

```sh
export PYTHONPATH="$PWD:${PYTHONPATH:-}"
export ENVIRONMENT=TESTING POSTGRESQL_HOST=127.0.0.1 POSTGRESQL_PORT=15432
export POSTGRESQL_USERNAME=test POSTGRESQL_PASSWORD=test POSTGRESQL_DATABASE=test
export POSTGRESQL_ASYNC_SCHEME=postgresql+asyncpg POSTGRESQL_SYNC_SCHEME=postgresql+psycopg
export REDIS_HOST=127.0.0.1 REDIS_PORT=16379 REDIS_ROOT_PASSWORD=test
export REDIS_DATABASE=0 CELERY_REDIS_DATABASE=1
export MINIO_ROOT_USER=test MINIO_ROOT_PASSWORD=test1234
export CORS_ORIGINS='["*"]' CORS_HEADERS='["*"]'
export ACCESS_TOKEN_KEY=pytest-only-access-secret REFRESH_TOKEN_KEY=pytest-only-refresh-secret
export IMPERSONATION_TOKEN_KEY=pytest-only-impersonation-secret
export ACCEPTANCE_PYTHON="$(command -v python)"
RAPIDKIT_CELERY_ACCEPTANCE=1 IMPERSONATION_SESSION_EXP=30 \
  ACCEPTANCE_LOG_DIR=/tmp/impersonation-celery-acceptance \
  python -m scripts.validation.impersonation_celery_acceptance
```

等待专用PostgreSQL就绪后再运行。脚本占用本机18060，启动并自动收尾自己的API、Worker和Beat进程。运行约90秒，生产到期扫描间隔保持60秒。测试只保留生产的到期Beat配置，并添加3秒数据库探针计划，排除无关周期任务；不更改生产配置文件，也不使用eager、内存broker、人工调用 `run()` 或mock认证。

测试角色只在专用库中获得 `POST:/api/v1/tasks/trigger`，用于验证真实目标权限下的HTTP生产者。探针返回身份、任务ID、重试次数和进程ID，不返回JWT或管理员备用凭证。

输出目录包含 `evidence.json`、API/Worker/Beat日志和seed日志。验收完成后仅删除自己创建的上述容器；代码和证据应保留。真实运行记录见 `docs/superpowers/validation/2026-10-16-user-impersonation-celery.md`。
