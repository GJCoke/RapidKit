# ============================================================
# Stage 1: build — install deps and build SPA
# ============================================================
FROM node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.27.0 --activate

WORKDIR /app

# Copy dependency manifests first for cache-friendly layer
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./

# Copy each package's package.json (needed for pnpm workspace resolution)
COPY packages/alova/package.json packages/alova/package.json
COPY packages/axios/package.json packages/axios/package.json
COPY packages/builder/package.json packages/builder/package.json
COPY packages/color/package.json packages/color/package.json
COPY packages/editor/package.json packages/editor/package.json
COPY packages/hooks/package.json packages/hooks/package.json
COPY packages/utils/package.json packages/utils/package.json
COPY apps/frontend/package.json apps/frontend/package.json
# Backend package.json is needed for workspace resolution (pnpm postinstall runs uv sync, skip it)
COPY apps/backend/package.json apps/backend/package.json

# Install dependencies (skip backend postinstall which runs uv sync)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source code for packages and frontend
COPY packages/ packages/
COPY apps/frontend/ apps/frontend/

# Build frontend (turbo auto-builds dependent packages first)
RUN pnpm turbo build --filter @monorepo-example/frontend

# ============================================================
# Stage 2: serve — nginx serves the static SPA
# ============================================================
FROM nginx:stable-alpine AS serve

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy built SPA from build stage
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html

# Copy our nginx config
COPY docker/prod/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
