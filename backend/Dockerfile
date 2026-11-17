# Backend (NestJS + Fastify): API REST, WebSocket (/socket.io), colaboração
# (/collab) e servidor MCP (/mcp). Roda na rede PRIVADA (EKS).
# Build a partir da raiz do repositório:
#   docker build -f backend/Dockerfile -t as-docs-backend .
FROM node:26-slim AS base
LABEL org.opencontainers.image.title="as-docs-backend"
RUN npm install -g pnpm@11.15.1

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm nx run server:build && pnpm nx run @tcc-docs/editor-ext:build

FROM base AS installer
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash chromium curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV PDF_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=3000

COPY --from=builder /app/apps/server/dist /app/apps/server/dist
COPY --from=builder /app/apps/server/src/integrations/export/pdf/assets /app/apps/server/dist/integrations/export/pdf/assets
COPY --from=builder /app/apps/server/package.json /app/apps/server/package.json
COPY --from=builder /app/packages/editor-ext/dist /app/packages/editor-ext/dist
COPY --from=builder /app/packages/editor-ext/package.json /app/packages/editor-ext/package.json
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm*.yaml /app/

RUN chown -R node:node /app
USER node
RUN pnpm install --frozen-lockfile --prod
RUN mkdir -p /app/data/storage

# Sem apps/client/dist o StaticModule não registra o front: este container
# só responde API. O front é servido pelo container frontend (Nginx).
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health/live" || exit 1
CMD ["pnpm", "start"]
