# Root Dockerfile so Railway uses Docker (and bun) instead of Railpack/npm.
# npm doesn't support workspace:* — this image uses bun install.
FROM oven/bun:1.2-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/api/package.json ./packages/api/package.json
RUN bun install --frozen-lockfile

# Copy source
COPY tsconfig.base.json ./
COPY packages/core/ ./packages/core/
COPY packages/api/ ./packages/api/

# Ensure data dir exists at runtime (mounted as volume)
RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production
ENV DB_PATH=/app/data/riftseer.db

CMD ["bun", "packages/api/src/index.ts"]
