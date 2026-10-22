ARG REGISTRY_PREFIX=""
ARG UV_IMAGE=ghcr.io/astral-sh/uv:latest
FROM ${UV_IMAGE} AS uv
FROM ${REGISTRY_PREFIX}python:3.14-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev \
    && rm -rf /var/lib/apt/lists/*
COPY --from=uv /uv /uvx /usr/local/bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY apps/backend/pyproject.toml apps/backend/pyproject.toml
COPY packages/core/pyproject.toml packages/core/pyproject.toml
COPY packages/common/pyproject.toml packages/common/pyproject.toml
COPY packages/framework/pyproject.toml packages/framework/pyproject.toml
COPY packages/security/pyproject.toml packages/security/pyproject.toml
COPY apps/backend/plugins/auth/pyproject.toml apps/backend/plugins/auth/pyproject.toml
COPY apps/backend/plugins/department/pyproject.toml apps/backend/plugins/department/pyproject.toml
COPY apps/backend/plugins/menu/pyproject.toml apps/backend/plugins/menu/pyproject.toml
COPY apps/backend/plugins/monitoring/pyproject.toml apps/backend/plugins/monitoring/pyproject.toml
COPY apps/backend/plugins/notification/pyproject.toml apps/backend/plugins/notification/pyproject.toml
COPY apps/backend/plugins/permission/pyproject.toml apps/backend/plugins/permission/pyproject.toml
COPY apps/backend/plugins/schedule/pyproject.toml apps/backend/plugins/schedule/pyproject.toml
COPY apps/backend/plugins/system/pyproject.toml apps/backend/plugins/system/pyproject.toml
COPY apps/backend/plugins/user/pyproject.toml apps/backend/plugins/user/pyproject.toml
COPY apps/backend/plugins/worker/pyproject.toml apps/backend/plugins/worker/pyproject.toml

FROM base AS dev
RUN uv sync --dev --frozen --no-install-workspace --project apps/backend
CMD ["uv", "run", "--project", "apps/backend", "uvicorn", "src.main:app", "--reload", "--host", "0.0.0.0", "--port", "8006"]

FROM base AS prod
RUN uv sync --no-dev --frozen --no-install-workspace --project apps/backend
COPY packages/core packages/core
COPY packages/common packages/common
COPY packages/framework packages/framework
COPY packages/security packages/security
COPY apps/backend/src apps/backend/src
COPY apps/backend/scripts apps/backend/scripts
COPY apps/backend/alembic apps/backend/alembic
COPY apps/backend/alembic.ini apps/backend/alembic.ini
COPY apps/backend/plugins.toml apps/backend/plugins.toml
COPY apps/backend/plugins apps/backend/plugins
RUN uv sync --no-dev --frozen --project apps/backend \
    && groupadd -r app && useradd -r -g app -d /app app \
    && mkdir -p /app/apps/backend/logs && chown -R app:app /app
COPY --chmod=755 docker/backend/entrypoint.sh /usr/local/bin/rapidkit-entrypoint
ENV PATH="/app/.venv/bin:$PATH"
USER app
WORKDIR /app/apps/backend
EXPOSE 8006
ENTRYPOINT ["rapidkit-entrypoint"]
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8006", "--workers", "4"]
