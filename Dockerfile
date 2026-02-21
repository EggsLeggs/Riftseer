# Root Dockerfile — serves the API from one container.
# Bun 1.3+ required (Elysia is Bun-first).
# Supabase + Redis are external services; set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# and REDIS_URL in the Railway dashboard (or equivalent).
FROM oven/bun:1.3-alpine AS base
WORKDIR /app

# Install dependencies (strip workspace members not needed in the image)
COPY package.json bun.lock* ./
RUN sed -i 's/, *"packages\/frontend"//g; s/, *"packages\/discord-bot"//g; s/, *"packages\/ingest-worker"//g' package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/api/package.json ./packages/api/package.json
RUN bun install

# Copy source
COPY tsconfig.base.json ./
COPY packages/core/ ./packages/core/
COPY packages/api/ ./packages/api/

EXPOSE 3000

ENV NODE_ENV=production
ENV CARD_PROVIDER=supabase

RUN addgroup -S appuser && adduser -S -G appuser appuser && \
    chown -R appuser:appuser /app
USER appuser

WORKDIR /app/packages/api
CMD ["bun", "src/index.ts"]
