# Deploy na AWS

```
Usuário → WAF → ALB (público) → EC2 frontend (AZ A, AZ B) — Nginx
            Nginx /api, /socket.io, /collab → NLB interno → backend (EKS, privada)
            backend → As-docs-ai (ClusterIP) → OpenAI (via NAT)
            backend/IA → Redis 8 (EKS)    backend → RDS PostgreSQL
```

## Imagens

```bash
docker build -f frontend/Dockerfile -t ghcr.io/albibino/as-docs-frontend:latest .
docker build -f backend/Dockerfile  -t ghcr.io/albibino/as-docs-backend:latest .
```
(ou ECR: troque o prefixo da imagem nos manifests e no `.env` da EC2.)

## Backend no EKS (subnets privadas)

```bash
kubectl apply -f deploy/k8s/00-namespace.yaml -f deploy/k8s/10-redis.yaml
kubectl -n as-docs create secret generic as-docs-backend-secret \
  --from-literal=APP_SECRET="$(openssl rand -hex 32)" \
  --from-literal=DOCS_AI_HMAC_SECRET="<mesmo do As-docs-ai>" \
  --from-literal=DATABASE_URL="postgresql://USUARIO:SENHA@<endpoint-rds>:5432/asdocs?sslmode=require"
kubectl apply -f deploy/k8s/20-backend-config.yaml -f deploy/k8s/22-backend.yaml
kubectl -n as-docs get svc as-docs-backend   # EXTERNAL-IP = DNS do NLB interno
```
Depois aplique `deploy/k8s` do repositório **As-docs-ai**.

## Frontend nas EC2 (subnets públicas)

Use `deploy/ec2/user-data.sh` no Launch Template, com `BACKEND_URL` = DNS do NLB
interno (`http://<dns>:3000`) e `PUBLIC_APP_URL` = domínio público.
Target group do ALB: porta 80, health check `GET /healthz`.

## Onde mudar cada coisa

| Quero apontar para… | Onde |
|---|---|
| Outro backend (frontend) | `.env` da EC2 → `BACKEND_URL`; `docker compose up -d` |
| Domínio público | `PUBLIC_APP_URL` (EC2) **e** `APP_URL` (ConfigMap do backend) |
| Outro banco | Secret `DATABASE_URL` → `rollout restart` |
| Outra IA | ConfigMap `DOCS_AI_URL` |
| Redis | ConfigMap `REDIS_URL` (backend) / `REDIS_URL` (IA) |

## Security Groups

| SG | Entrada |
|---|---|
| ALB | 443 (e 80 → redirect) de 0.0.0.0/0, com WAF associado |
| EC2 frontend | 80 só do SG do ALB; sem SSH (use SSM Session Manager) |
| NLB interno / nós EKS | 3000 só do SG das EC2 frontend |
| RDS | 5432 só do SG dos nós/pods do EKS |

`/mcp` é bloqueado no Nginx: só a IA acessa, dentro do cluster.
