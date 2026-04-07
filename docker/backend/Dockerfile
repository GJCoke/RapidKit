# ============================================================
# Stage 1: base — shared foundation for dev and prod
# ============================================================
FROM python:3.14-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# ============================================================
# Stage 2: dev — for running inside a container with volume mount
# ============================================================
FROM base AS dev

# Copy dependency manifests (from repo root context)
COPY pyproject.toml uv.lock ./
COPY apps/backend/pyproject.toml apps/backend/pyproject.toml

# Install all dependencies including dev
RUN uv sync --dev --frozen --project apps/backend

# Source code is volume-mounted at runtime, not copied
# CMD uses --reload for hot reload
CMD ["uv", "run", "--project", "apps/backend", "uvicorn", "src.main:app", "--reload", "--host", "0.0.0.0", "--port", "8006"]

# ============================================================
# Stage 3: prod — optimized production image
# ============================================================
FROM base AS prod

# Copy dependency manifests first for cache-friendly installs
COPY pyproject.toml uv.lock ./
COPY apps/backend/pyproject.toml apps/backend/pyproject.toml

# Install production dependencies only
RUN uv sync --no-dev --frozen --project apps/backend

# Copy backend source code
COPY apps/backend/src apps/backend/src
COPY apps/backend/scripts apps/backend/scripts
COPY apps/backend/alembic.ini apps/backend/alembic.ini

# Create non-root user
RUN groupadd -r app && useradd -r -g app -d /app app \
    && chown -R app:app /app
USER app

WORKDIR /app/apps/backend

EXPOSE 8006

CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8006", "--workers", "4"]
