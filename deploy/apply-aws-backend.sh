#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
region=us-east-1
account=${EXPECTED_AWS_ACCOUNT_ID:?}
cluster=${EKS_CLUSTER:?}
lab_http=${OIDC_AWS_LAB_HTTP:-false}
preserve_oauth=${BACKEND_PRESERVE_AI_OAUTH:-false}
[[ $account =~ ^[0-9]{12}$ && $cluster =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$ ]]
[[ $lab_http == true || $lab_http == false ]]
[[ $preserve_oauth == true || $preserve_oauth == false ]]
[[ $(aws sts get-caller-identity --region "$region" --query Account --output text --no-cli-pager) == "$account" ]] || {
  printf 'Conta AWS diferente do state do lab.\n' >&2; exit 1;
}
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
export KUBECONFIG="$work/kubeconfig"
context="arn:aws:eks:$region:$account:cluster/$cluster"
aws eks update-kubeconfig --region "$region" --name "$cluster" --kubeconfig "$KUBECONFIG" --no-cli-pager >/dev/null
k=(kubectl --context "$context" --request-timeout=60s)
if ! "${k[@]}" -n as-docs get secret as-docs-backend-secret -o name >/dev/null; then
  printf 'Prepare o Secret as-docs/as-docs-backend-secret antes do deploy.\n' >&2
  exit 1
fi
kubectl --context "$context" -n as-docs-identity rollout status deployment/as-docs-keycloak --timeout=6m
active_oauth=$("${k[@]}" -n as-docs get configmap as-docs-backend-config --ignore-not-found -o 'jsonpath={.data.DOCS_AI_OAUTH_ENABLED}')
if [[ $active_oauth == true && $preserve_oauth != true ]]; then
  printf 'OAuth da IA já está ativo; configure ai_oauth para atualizar sem rebaixar a autenticação.\n' >&2
  exit 1
fi
if [[ $lab_http == true ]]; then
  "${k[@]}" -n as-docs-identity get configmap as-docs-keycloak-rds-ca -o 'jsonpath={.data.ca\.pem}' > "$work/ca.pem"
  openssl crl2pkcs7 -nocrl -certfile "$work/ca.pem" -out /dev/null
  printf '\n' >> "$work/ca.pem"
  "${k[@]}" -n as-docs-identity get secret as-docs-keycloak-tls -o 'jsonpath={.data.tls\.crt}' | base64 -d > "$work/keycloak.crt"
  openssl x509 -in "$work/keycloak.crt" -checkend 0 -noout >/dev/null
  cat "$work/keycloak.crt" >> "$work/ca.pem"
  "${k[@]}" -n as-docs create configmap as-docs-aws-lab-trust --from-file="ca.pem=$work/ca.pem" --dry-run=client -o yaml |
    "${k[@]}" apply --server-side -f -
fi
"${k[@]}" apply --server-side -f "$root/infra/terraform/storage-gp3.yaml"
"${k[@]}" apply --server-side -f "$root/deploy/k8s/10-redis.yaml"
kubectl --context "$context" -n as-docs rollout status statefulset/redis --timeout=5m
if [[ $active_oauth != true ]]; then
  DOCS_AI_OAUTH_ENABLED=false bash "$root/deploy/render-aws-backend.sh" > "$work/backend.yaml"
  "${k[@]}" apply --server-side --dry-run=server -f "$work/backend.yaml"
  "${k[@]}" apply --server-side -f "$work/backend.yaml"
fi
kubectl --context "$context" -n as-docs rollout status deployment/as-docs-backend --timeout=8m
