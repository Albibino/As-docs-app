#!/usr/bin/env bash
set -euo pipefail

account=${EXPECTED_AWS_ACCOUNT_ID:?}
region=us-east-1
cluster=${EKS_CLUSTER:?}
namespace=as-docs-identity

[[ "$account" =~ ^[0-9]{12}$ ]] || { printf 'ID de conta AWS inválido.\n' >&2; exit 1; }
[[ "$cluster" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$ ]] || { printf 'Nome de cluster inválido.\n' >&2; exit 1; }
context="arn:aws:eks:$region:$account:cluster/$cluster"
[[ "$(aws sts get-caller-identity --region "$region" --query Account --output text --no-cli-pager)" == "$account" ]] || {
  printf 'Conta AWS não autorizada ou credencial indisponível.\n' >&2; exit 1;
}

k=(kubectl --context "$context" --request-timeout=20s)
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
export KUBECONFIG="$tmp/kubeconfig"
aws eks update-kubeconfig --region "$region" --name "$cluster" --kubeconfig "$KUBECONFIG" --no-cli-pager >/dev/null
# Consulta somente metadados de existência; Terraform nunca recebe os valores.
"${k[@]}" get namespace "$namespace" -o name
"${k[@]}" -n "$namespace" get secret as-docs-keycloak-db as-docs-keycloak-tls
ca_bundle="$tmp/rds-ca.pem"
curl --fail --silent --show-error --max-time 30 \
  "https://truststore.pki.rds.amazonaws.com/$region/$region-bundle.pem" > "$ca_bundle"
[[ -s "$ca_bundle" ]] || { printf 'Bundle da CA do RDS vazio.\n' >&2; exit 1; }
"${k[@]}" -n "$namespace" create configmap as-docs-keycloak-rds-ca \
  --from-file="ca.pem=$ca_bundle" --dry-run=client -o yaml |
  "${k[@]}" apply --server-side --field-manager=as-docs-infra-keycloak -f -
printf '%s\n' "${KEYCLOAK_MANIFEST:?}" | "${k[@]}" apply --server-side --field-manager=as-docs-infra-keycloak --dry-run=server -f -
printf '%s\n' "$KEYCLOAK_MANIFEST" | "${k[@]}" apply --server-side --field-manager=as-docs-infra-keycloak -f -
kubectl --context "$context" -n "$namespace" rollout status deployment/as-docs-keycloak --timeout=6m
