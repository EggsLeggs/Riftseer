# Root Dockerfile — serves the API + static frontend from one container.
# Bun 1.3+ required for the fullstack static plugin (await staticPlugin()).
FROM oven/bun:1.3-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN sed -i 's/, "packages\/frontend"//' package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/api/package.json ./packages/api/package.json
RUN bun install

# Copy source
COPY tsconfig.base.json ./
COPY packages/core/ ./packages/core/
COPY packages/api/ ./packages/api/

# Ensure data dir exists at runtime (mounted as volume)
RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production
ENV DB_PATH=/app/data/riftseer.db

WORKDIR /app/packages/api
CMD ["bun", "src/index.ts"]
