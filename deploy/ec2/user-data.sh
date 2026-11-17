#!/bin/bash
# User data da EC2 do frontend (Amazon Linux 2023). Preencha as variáveis abaixo
# ou use um Launch Template com valores diferentes por ambiente.
set -euo pipefail

FRONTEND_IMAGE="ghcr.io/albibino/as-docs-frontend:latest"
BACKEND_URL="http://internal-as-docs-backend-xxxx.elb.us-east-1.amazonaws.com:3000"
PUBLIC_APP_URL="https://docs.exemplo.com"

dnf install -y docker
systemctl enable --now docker
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

mkdir -p /opt/as-docs && cd /opt/as-docs
cat > .env <<EOF
FRONTEND_IMAGE=${FRONTEND_IMAGE}
BACKEND_URL=${BACKEND_URL}
PUBLIC_APP_URL=${PUBLIC_APP_URL}
COLLAB_URL=
FILE_UPLOAD_SIZE_LIMIT=50mb
FILE_IMPORT_SIZE_LIMIT=200mb
CLIENT_MAX_BODY_SIZE=200m
NGINX_PORT=8080
EOF
chmod 600 .env

cat > docker-compose.yml <<'EOF'
services:
  frontend:
    image: ${FRONTEND_IMAGE}
    env_file: .env
    ports: ['80:8080']
    restart: unless-stopped
EOF

docker compose up -d
