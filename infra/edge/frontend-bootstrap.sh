#!/usr/bin/env bash
# Prepara somente o host. O Muci publica o frontend real; nao ha site ficticio.
set -euo pipefail
dnf install -y docker amazon-ssm-agent
install -d -m 0755 /etc/docker
cat >/etc/docker/daemon.json <<'JSON'
{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}
JSON
systemctl enable --now docker amazon-ssm-agent
install -d -m 0750 /opt/as-docs
cat >/opt/as-docs/INFRA-PRONTA.txt <<'TEXT'
Host preparado com Docker e agente SSM. Deploy da aplicacao pelo responsavel.
Use os outputs frontend_instances, backend_url e public_app_url do state edge.
O ALB so ficara healthy depois de publicar o Nginx real na porta 80.
Nao inclua token de registro, senha do banco ou chave da IA em user-data.
TEXT
