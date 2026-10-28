# syntax=docker/dockerfile:1

# ============================================================
# Configurable registry sources (override via --build-arg or env file)
# ============================================================
ARG REGISTRY_PREFIX=""
ARG NPM_REGISTRY=https://registry.npmjs.org

# ============================================================
# Stage 1: build — install deps and build SPA
# ============================================================
FROM ${REGISTRY_PREFIX}node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.27.0 --activate

WORKDIR /app

ARG NPM_REGISTRY
ENV npm_config_registry=${NPM_REGISTRY}

# Keep dependency installation independent of source and build configuration changes.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Include only the frontend workspace and the shared packages needed to build it.
COPY packages/axios/package.json packages/axios/package.json
COPY packages/builder/package.json packages/builder/package.json
COPY packages/color/package.json packages/color/package.json
COPY packages/hooks/package.json packages/hooks/package.json
COPY packages/utils/package.json packages/utils/package.json
COPY apps/frontend/package.json apps/frontend/package.json

RUN --mount=type=cache,id=rapidkit-frontend-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --prefer-offline --store-dir=/pnpm/store

# Copy source code for packages and frontend
COPY turbo.json tsconfig.json ./
COPY packages/axios/ packages/axios/
COPY packages/builder/ packages/builder/
COPY packages/color/ packages/color/
COPY packages/hooks/ packages/hooks/
COPY packages/utils/ packages/utils/
COPY apps/frontend/ apps/frontend/

# Build packages then frontend with prod mode.
RUN pnpm turbo build --filter='@rapidkit/frontend^...' \
    && cd apps/frontend && pnpm vite build --mode prod

# ============================================================
# Stage 2: serve — nginx serves the static SPA
# ============================================================
ARG REGISTRY_PREFIX=""
FROM ${REGISTRY_PREFIX}nginx:stable-alpine AS serve

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy built SPA from build stage
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html

# Copy our nginx config
COPY docker/prod/nginx.conf /etc/nginx/templates/nginx.conf.template
COPY docker/prod/security-headers.conf /etc/nginx/security-headers.conf

ENV MAX_REQUEST_BODY_BYTES=10485760 \
    SECURITY_HSTS_ENABLED=false \
    NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx \
    NGINX_ENVSUBST_FILTER="^(MAX_REQUEST_BODY_BYTES|SECURITY_HSTS_ENABLED)$"

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
