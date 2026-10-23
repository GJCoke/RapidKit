ARG REGISTRY_PREFIX=""
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.12.5
ARG PYTHON_IMAGE=python:3.14.7-slim
FROM ${UV_IMAGE} AS uv

# Collect every workspace manifest so new packages or plugins need no Dockerfile edits.
# Only the extracted manifests are copied onward, so source edits keep the dependency layer cached.
FROM ${REGISTRY_PREFIX}${PYTHON_IMAGE} AS manifests
WORKDIR /src
COPY apps/backend apps/backend
COPY packages packages
RUN mkdir /out && cp --parents \
    apps/backend/pyproject.toml apps/backend/plugins/*/pyproject.toml packages/*/pyproject.toml /out/

FROM ${REGISTRY_PREFIX}${PYTHON_IMAGE} AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8 UV_LINK_MODE=copy
COPY --from=uv /uv /uvx /usr/local/bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY --from=manifests /out/ ./

# Source is volume-mounted at runtime; keep the venv outside /app so the mount cannot shadow it.
# `uv run` installs the mounted workspace members on first start.
FROM base AS dev
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --dev --frozen --no-install-workspace --project apps/backend
CMD ["uv", "run", "--project", "apps/backend", "uvicorn", "src.main:app", "--reload", "--host", "0.0.0.0", "--port", "8006"]

FROM base AS prod
# Only the app-owned paths are chowned; the venv stays root-owned so it is not duplicated in a chown layer.
RUN groupadd -r app && useradd -r -g app -d /app app \
    && mkdir -p /app/apps/backend/logs \
    && chown app:app /app /app/apps/backend /app/apps/backend/logs
RUN --mount=type=cache,target=/root/.cache/uv \
    UV_COMPILE_BYTECODE=1 uv sync --no-dev --frozen --no-install-workspace --project apps/backend
COPY --chown=app:app packages/core packages/core
COPY --chown=app:app packages/common packages/common
COPY --chown=app:app packages/framework packages/framework
COPY --chown=app:app packages/security packages/security
COPY --chown=app:app apps/backend/src apps/backend/src
COPY --chown=app:app apps/backend/scripts apps/backend/scripts
COPY --chown=app:app apps/backend/alembic apps/backend/alembic
COPY --chown=app:app apps/backend/alembic.ini apps/backend/alembic.ini
COPY --chown=app:app apps/backend/plugins.toml apps/backend/plugins.toml
COPY --chown=app:app apps/backend/plugins apps/backend/plugins
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev --frozen --project apps/backend
COPY --chmod=755 docker/backend/entrypoint.sh /usr/local/bin/rapidkit-entrypoint
ENV PATH="/app/.venv/bin:$PATH"
USER app
WORKDIR /app/apps/backend
EXPOSE 8006
ENTRYPOINT ["rapidkit-entrypoint"]
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8006", "--workers", "4", "--timeout-graceful-shutdown", "30", "--proxy-headers"]
