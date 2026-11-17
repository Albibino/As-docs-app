# Frontend (React/Vite) servido por Nginx. Roda na rede PÚBLICA (EC2 atrás do ALB).
# O Nginx entrega os estáticos e faz proxy reverso de /api, /socket.io e /collab
# para o backend na rede privada (BACKEND_URL). O navegador nunca fala direto
# com a rede privada.
# Build a partir da raiz do repositório:
#   docker build -f frontend/Dockerfile -t as-docs-frontend .
FROM node:26-slim AS builder
RUN npm install -g pnpm@11.15.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm nx run client:build

FROM nginx:1.29-alpine
LABEL org.opencontainers.image.title="as-docs-frontend"
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html
COPY frontend/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY frontend/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf

# Valores padrão; sobrescreva com -e / --env-file sem rebuild.
ENV BACKEND_URL=http://backend:3000 \
    PUBLIC_APP_URL=http://localhost:8080 \
    COLLAB_URL="" \
    FILE_UPLOAD_SIZE_LIMIT=50mb \
    FILE_IMPORT_SIZE_LIMIT=200mb \
    CLIENT_MAX_BODY_SIZE=200m \
    DRAWIO_URL=https://embed.diagrams.net \
    NGINX_PORT=8080 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_ENVSUBST_FILTER="^(BACKEND_URL|PUBLIC_APP_URL|COLLAB_URL|FILE_UPLOAD_SIZE_LIMIT|FILE_IMPORT_SIZE_LIMIT|CLIENT_MAX_BODY_SIZE|DRAWIO_URL|NGINX_PORT|NGINX_LOCAL_RESOLVERS)$"

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${NGINX_PORT}/healthz" >/dev/null || exit 1
