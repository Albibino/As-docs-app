# Deploy manual na AWS

O Terraform prepara `ALB público → Nginx nas duas EC2 → NLB privado → NodePort 30300 → backend no EKS`. O backend usa Redis 8 e RDS. No laboratório individual, configure [`app_deploy`](../infra/lab/README.md#publicação-da-aplicação-e-encerramento) para publicar no mesmo `apply` após preparar as credenciais. Sem essa opção, a aplicação não é publicada. Use somente os outputs de `infra/lab`; a entrega histórica ao Muci contém dados de outra conta. Para incluir a IA, veja [Client Credentials](../docs/tcc/13-ia-oauth-aws.md).

Para o laboratório descartável sem domínio nem ACM, siga o [modo HTTP do Learner Lab](../infra/edge/KEYCLOAK.md#modo-http-do-learner-lab). O restante deste roteiro descreve o modo HTTPS padrão.

## 1. Conta, HTTPS e identidade

- Compare `terraform -chdir=infra/lab output -raw aws_account_id` com `aws sts get-caller-identity --query Account --output text`. Pare se não coincidirem. Use `terraform -chdir=infra/lab output` para obter cluster, EC2, RDS e `backend_url`. Configure o kubeconfig com `aws eks update-kubeconfig --region us-east-1 --name <cluster>` e defina `CTX` com o ARN do cluster verificado.
- Configure DNS e certificado ACM `ISSUED` na mesma conta/região. Siga [Keycloak no EKS](../infra/edge/KEYCLOAK.md) a partir de `infra/lab`, sem usar o state nem os helpers legados. Prepare o banco e os Secrets do Keycloak. Valide a descoberta OIDC na origem HTTPS. Não use o DNS HTTP do ALB para publicar o app nem exponha o seletor legado.
- Prepare as duas contas autorizadas do realm e o cliente `docs-app-web` com callback `https://<domínio>/api/auth/oidc/callback`. Após o seed do backend, vincule os pares `(iss, sub)` às contas locais no RDS. Use a transação SQL de `scripts/tcc-link-oidc.sh` como referência, substituindo o issuer local pelo issuer HTTPS e usando um cliente autorizado na VPC. Este passo inicial não ativa OAuth app → IA.

## 2. Imagens da mesma revisão

Defina `REGISTRY_PREFIX` como o prefixo autorizado e faça o build de um checkout limpo da revisão aprovada. Em registro privado, prepare o pull no EKS (permissões do kubelet ou `imagePullSecrets`) e nas duas EC2. Não coloque credenciais no contexto do build, user-data ou comandos SSM. Não compile nas EC2.

```bash
revision=$(git rev-parse HEAD)
docker build --platform linux/amd64 -f backend/Dockerfile  -t "$REGISTRY_PREFIX/as-docs-backend:$revision" .
docker build --platform linux/amd64 -f frontend/Dockerfile -t "$REGISTRY_PREFIX/as-docs-frontend:$revision" .
docker push "$REGISTRY_PREFIX/as-docs-backend:$revision"
docker push "$REGISTRY_PREFIX/as-docs-frontend:$revision"
```

Guarde o SHA de origem e os dois digests publicados. Use `registro/repositório@sha256:<digest>` para `BACKEND_IMAGE` e `FRONTEND_IMAGE`. O futuro CI/CD pode reutilizar este procedimento com artefatos gerados para o SHA do merge na `main`, sem `git pull` nos hosts.

## 3. EKS

Defina `PUBLIC_APP_URL=https://<domínio>` sem barra final. Prepare um arquivo `KEY=value` (modo `0600`, fora do Git) com `DATABASE_URL` de um usuário dedicado ao app com TLS no RDS, `APP_SECRET`, `DOCS_AI_HMAC_SECRET` e `OIDC_CLIENT_SECRET_WEB`. Não use o administrador do RDS no Deployment nem regenere `APP_SECRET` a cada atualização. Defina `BACKEND_SECRET_FILE` com o caminho, não com o conteúdo.

```bash
set -euo pipefail
bundle=$(mktemp)
trap 'rm -f "$bundle"' EXIT
BACKEND_IMAGE="$BACKEND_IMAGE" PUBLIC_APP_URL="$PUBLIC_APP_URL" bash deploy/render-aws-backend.sh > "$bundle"
kubectl --context "$CTX" apply -f infra/terraform/storage-gp3.yaml
kubectl --context "$CTX" -n as-docs create secret generic as-docs-backend-secret \
  --from-env-file="$BACKEND_SECRET_FILE" --dry-run=client -o yaml |
  kubectl --context "$CTX" apply --server-side -f -
kubectl --context "$CTX" apply -f deploy/k8s/10-redis.yaml
kubectl --context "$CTX" -n as-docs rollout status statefulset/redis --timeout=5m
kubectl --context "$CTX" apply --dry-run=server -f "$bundle"
kubectl --context "$CTX" apply -f "$bundle"
kubectl --context "$CTX" -n as-docs rollout status deployment/as-docs-backend --timeout=8m
```

O resultado inclui NodePort. Não aplique `deploy/k8s/` inteiro (inclui Secret de exemplo e bases não renderizadas). Se mudar apenas Secret ou ConfigMap, reinicie o Deployment explicitamente. Para a IA, siga `deploy/README.md` do repositório As-docs-ai com imagem acessível, a chave própria da OpenAI e o mesmo HMAC. O health check do backend não comprova funcionamento da IA.

## 4. Duas EC2 e validação

Use SSM, sem abrir SSH. Em `/opt/as-docs` de cada EC2, coloque `deploy/ec2/docker-compose.yml` com o nome `docker-compose.yml` e um `.env` conforme `frontend/.env.example`. Use `BACKEND_URL` do output privado `backend_url`, a origem HTTPS em `PUBLIC_APP_URL` e o digest em `FRONTEND_IMAGE`. Instale um plugin Compose aprovado se ainda não estiver disponível.

```bash
cd /opt/as-docs
docker compose config --quiet && docker compose pull && docker compose up -d
curl -fsS http://127.0.0.1/healthz
curl -fsS http://127.0.0.1/api/health/live
```

Em atualizações, faça um host por vez e aguarde `healthy` antes de atualizar o outro. Confirme HTTP 200 em `/healthz` e `/api/health/live` pela origem HTTPS, os dois target groups saudáveis e login das duas contas, sem sessão pelo seletor legado. Teste IA, SSE, WebSocket, colaboração e uploads. Para reverter, reaplique os digests anteriores e a configuração correspondente; confirme a compatibilidade das migrações do RDS antes de reverter o backend.

`bash deploy/test-aws-render.sh` valida o manifesto localmente sem publicar imagens ou consultar a AWS.
