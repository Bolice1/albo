# syntax=docker/dockerfile:1

FROM oven/bun:1-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM oven/bun:1-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
RUN bun x prisma generate && bun run build

FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 albo \
  && useradd --system --uid 1001 --gid albo --shell /usr/sbin/nologin --create-home albo

COPY --from=builder --chown=albo:albo /app/package.json ./package.json
COPY --from=builder --chown=albo:albo /app/node_modules ./node_modules
COPY --from=builder --chown=albo:albo /app/prisma ./prisma
COPY --from=builder --chown=albo:albo /app/dist ./dist

USER albo
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/health/live || exit 1

CMD ["bun", "dist/main.js"]
