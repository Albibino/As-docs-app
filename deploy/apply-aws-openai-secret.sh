#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

key=${OPENAI_API_KEY:?Chave OpenAI ausente}
unset OPENAI_API_KEY
if [[ $key =~ [[:space:]] ]]; then
  printf 'A chave OpenAI deve estar em uma única linha, sem espaços.\n' >&2
  exit 1
fi
account=${EXPECTED_AWS_ACCOUNT_ID:?}
cluster=${EKS_CLUSTER:?}
region=us-east-1
[[ $account =~ ^[0-9]{12}$ && $cluster =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$ ]]
[[ $(aws sts get-caller-identity --region "$region" --query Account --output text --no-cli-pager) == "$account" ]] || {
  printf 'Conta AWS diferente do state do lab.\n' >&2
  exit 1
}
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
export KUBECONFIG="$work/kubeconfig"
aws eks update-kubeconfig --region "$region" --name "$cluster" --kubeconfig "$KUBECONFIG" --no-cli-pager >/dev/null
k=(kubectl --context "arn:aws:eks:$region:$account:cluster/$cluster" --request-timeout=60s)
namespace=$("${k[@]}" get namespace as-docs --ignore-not-found -o name)
if [[ -z $namespace ]]; then
  "${k[@]}" create namespace as-docs || "${k[@]}" get namespace as-docs -o name
fi
printf '%s' "$key" |
  "${k[@]}" -n as-docs create secret generic as-docs-ai-openai --type=Opaque --from-file=OPENAI_API_KEY=/dev/stdin --dry-run=client -o json |
  "${k[@]}" -n as-docs apply --server-side --field-manager=as-docs-lab-openai -f -
unset key
"${k[@]}" -n as-docs get secret as-docs-ai-openai -o name
