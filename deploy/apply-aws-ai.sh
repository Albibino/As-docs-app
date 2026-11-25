#!/usr/bin/env bash
# Executado pela raiz infra/lab. Não habilite xtrace: o helper lê Secrets em memória.
set -euo pipefail
umask 077
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
ai_repo=${TCC_DOCS_AI_PATH:-"$root/../As-docs-ai"}
region=us-east-1
account=${EXPECTED_AWS_ACCOUNT_ID:?}
cluster=${EKS_CLUSTER:?}
issuer=${OIDC_ISSUER:?}
[[ $account =~ ^[0-9]{12}$ && $cluster =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$ ]]
[[ $issuer == "${PUBLIC_APP_URL:?}/id/realms/as-docs" ]] || { printf 'Issuer e origem do state não conferem.\n' >&2; exit 1; }
[[ -f "$ai_repo/deploy/render-aws-oauth.sh" ]] || { printf 'Checkout da IA sem o render OAuth; confira TCC_DOCS_AI_PATH.\n' >&2; exit 1; }
for cmd in aws kubectl openssl python3; do command -v "$cmd" >/dev/null; done
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
export KUBECONFIG="$work/kubeconfig"
actual=$(aws sts get-caller-identity --region "$region" --query Account --output text --no-cli-pager)
[[ $actual == "$account" ]] || { printf 'Conta AWS diferente do state do lab.\n' >&2; exit 1; }
context="arn:aws:eks:$region:$account:cluster/$cluster"
aws eks update-kubeconfig --region "$region" --name "$cluster" --kubeconfig "$KUBECONFIG" --no-cli-pager >/dev/null
k=(kubectl --context "$context" --request-timeout=60s -n as-docs)
"${k[@]}" get deployment as-docs-backend -o name
kubectl --context "$context" -n as-docs rollout status deployment/as-docs-backend --timeout=8m
kubectl --context "$context" -n as-docs-identity rollout status deployment/as-docs-keycloak --timeout=6m
kubectl --context "$context" -n as-docs rollout status statefulset/redis --timeout=5m
"${k[@]}" get configmap as-docs-aws-lab-trust -o 'jsonpath={.data.ca\.pem}' > "$work/keycloak-ca.pem"
openssl x509 -in "$work/keycloak-ca.pem" -noout >/dev/null
if [[ ${AI_PROVIDER_MODE:?} == openai ]]; then
  "${k[@]}" get secret as-docs-ai-openai -o name >/dev/null
fi
bootstrap_image=$("${k[@]}" get deployment as-docs-backend -o 'jsonpath={.spec.template.spec.containers[?(@.name=="backend")].image}')
bash "$root/deploy/import-aws-ai-clients.sh" "$context" "$bootstrap_image"
DOCS_AI_OAUTH_ENABLED=true bash "$root/deploy/render-aws-backend.sh" > "$work/backend.yaml"

probe() {
  # Captura somente o binding não secreto. O segredo segue pelo stdin de exec,
  # nunca pelo argv. A sonda tem endpoints fixos e não segue redirects.
  "${k[@]}" get secret as-docs-backend-ai-oauth -o json | python3 -c '
import base64, json, pathlib, sys
ca, ai_ca, issuer = sys.argv[1:]
fields = {"docs-app-indexer": "OIDC_CLIENT_SECRET_INDEXER",
          "docs-app-assistant": "OIDC_CLIENT_SECRET_ASSISTANT"}
try:
    data = json.load(sys.stdin)["data"]
    if set(data) != set(fields.values()):
        raise ValueError()
    keys = {client: base64.b64decode(data[key], validate=True).decode() for client, key in fields.items()}
    if not all(keys.values()):
        raise ValueError()
    print(json.dumps(dict(keys=keys, ca=pathlib.Path(ca).read_text(),
                          aiCa=pathlib.Path(ai_ca).read_text() if ai_ca else "", issuer=issuer)))
except (ValueError, KeyError, OSError):
    sys.exit("Secret técnico ou bundle de CA inválido.")
' "$work/keycloak-ca.pem" "$1" "$issuer" | \
    "${k[@]}" exec -i deploy/as-docs-backend -c backend -- node -e "$(< "$root/deploy/probe-aws-ai.cjs")"
}
AI_OAUTH_CLIENTS_JSON=$(probe '')
export AI_OAUTH_CLIENTS_JSON
bash "$ai_repo/deploy/render-aws-oauth.sh" > "$work/ai.yaml"

host=as-docs-ai.as-docs.svc.cluster.local
# Secret TLS exclusivo deste fluxo: instalações anteriores podem guardar certs
# sem a CA correspondente. Não adote/sobrescreva silenciosamente esses certs.
tls=$("${k[@]}" get secret as-docs-ai-oauth-tls --ignore-not-found -o name)
if [[ -z $tls ]]; then
  openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 365 -subj '/CN=As Docs AI internal CA' \
    -addext 'basicConstraints=critical,CA:TRUE,pathlen:0' -addext 'keyUsage=critical,keyCertSign,cRLSign' \
    -keyout "$work/ca.key" -out "$work/ai-ca.pem" 2>/dev/null
  openssl req -new -newkey rsa:2048 -nodes -keyout "$work/tls.key" -out "$work/tls.csr" \
    -subj "/CN=$host" 2>/dev/null
  printf 'subjectAltName=DNS:%s\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\n' "$host" > "$work/ext"
  openssl x509 -req -in "$work/tls.csr" -CA "$work/ai-ca.pem" -CAkey "$work/ca.key" -CAcreateserial \
    -out "$work/tls.crt" -days 365 -sha256 -extfile "$work/ext" 2>/dev/null
  "${k[@]}" create secret generic as-docs-ai-oauth-tls --type=kubernetes.io/tls \
    --from-file=tls.crt="$work/tls.crt" --from-file=tls.key="$work/tls.key" --from-file=ca.crt="$work/ai-ca.pem" \
    2>/dev/null || { printf 'Não foi possível criar o Secret TLS da IA.\n' >&2; exit 1; }
else
  # Somente certificados públicos são escritos no diretório local.
  "${k[@]}" get secret as-docs-ai-oauth-tls -o 'jsonpath={.data.ca\.crt}' | base64 -d > "$work/ai-ca.pem"
  "${k[@]}" get secret as-docs-ai-oauth-tls -o 'jsonpath={.data.tls\.crt}' | base64 -d > "$work/tls.crt"
fi
openssl verify -CAfile "$work/ai-ca.pem" -verify_hostname "$host" -purpose sslserver "$work/tls.crt" >/dev/null
cat "$work/keycloak-ca.pem" "$work/ai-ca.pem" > "$work/backend-ca.pem"
config_ca() {
  "${k[@]}" create configmap "$1" --from-file=ca.pem="$2" --dry-run=client -o yaml |
    "${k[@]}" apply --server-side -f -
}
config_ca as-docs-keycloak-ai-trust "$work/keycloak-ca.pem"
config_ca as-docs-ai-backend-trust "$work/backend-ca.pem"
"${k[@]}" apply --server-side --dry-run=server -f "$work/backend.yaml" -f "$work/ai.yaml" >/dev/null
"${k[@]}" apply --server-side -f "$work/ai.yaml"
kubectl --context "$context" -n as-docs rollout status deployment/as-docs-ai --timeout=8m
probe "$work/ai-ca.pem" >/dev/null
"${k[@]}" apply --server-side -f "$work/backend.yaml"
kubectl --context "$context" -n as-docs rollout status deployment/as-docs-backend --timeout=8m
probe "$work/ai-ca.pem" >/dev/null
printf 'IA privada pronta: indexador 200, cliente fora da política 403, sem token 401.\n'
