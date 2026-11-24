#!/usr/bin/env bash
set -euo pipefail

account=967931808920
region=us-east-1
cluster=as-docs-eks
namespace=as-docs-identity
context="arn:aws:eks:$region:$account:cluster/$cluster"

[[ "${EKS_CLUSTER:?}" == "$cluster" ]] || { printf 'Cluster inesperado.\n' >&2; exit 1; }
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
"${k[@]}" -n "$namespace" get configmap as-docs-keycloak-rds-ca -o name
printf '%s\n' "${KEYCLOAK_MANIFEST:?}" | "${k[@]}" apply --server-side --field-manager=as-docs-infra-keycloak --dry-run=server -f -
printf '%s\n' "$KEYCLOAK_MANIFEST" | "${k[@]}" apply --server-side --field-manager=as-docs-infra-keycloak -f -
kubectl --context "$context" -n "$namespace" rollout status deployment/as-docs-keycloak --timeout=6m
