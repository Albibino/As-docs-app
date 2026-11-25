#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/bin" "$work/repo/deploy/k8s" "$work/repo/infra/terraform"
cp "$root/deploy/apply-aws-backend.sh" "$work/repo/deploy/"
for file in 00-namespace 10-redis; do touch "$work/repo/deploy/k8s/$file.yaml"; done
touch "$work/repo/infra/terraform/storage-gp3.yaml"
printf '%s\n' 'echo BACKEND_RENDERED' > "$work/repo/deploy/render-aws-backend.sh"
cat > "$work/bin/aws" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *get-caller-identity* ]]; then echo 123456789012; fi
EOF
cat > "$work/bin/kubectl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  *'get secret as-docs-backend-secret '*)
    [[ ${MISSING_SECRET:-false} == false ]] && echo secret/as-docs-backend-secret ;;
  *'get configmap as-docs-backend-config '*) echo "${ACTIVE_OAUTH:-false}" ;;
  *'get configmap as-docs-keycloak-rds-ca '*) printf RDS-CA ;;
  *'get secret as-docs-keycloak-tls '*) printf 'S0MtQ0EK' ;;
  *'create configmap as-docs-aws-lab-trust '*)
    for arg; do case $arg in --from-file=ca.pem=*) [[ $(<"${arg#--from-file=ca.pem=}") == $'RDS-CA\nKC-CA' ]];; esac; done
    echo TRUST ;;
  *'apply --server-side -f -') [[ $(cat) == TRUST ]] && echo trust >> "$TRACE" ;;
  *'apply --server-side -f '*10-redis.yaml) echo redis >> "$TRACE" ;;
  *'rollout status statefulset/redis '*) echo redis-ready >> "$TRACE" ;;
  *'rollout status deployment/as-docs-keycloak '*) : ;;
  *'apply --server-side -f '*backend.yaml) echo backend >> "$TRACE" ;;
  *'rollout status deployment/as-docs-backend '*) echo backend-ready >> "$TRACE" ;;
  *'apply --server-side --dry-run=server -f '*backend.yaml) : ;;
  *'apply --server-side -f '*00-namespace.yaml|*'apply --server-side -f '*storage-gp3.yaml) : ;;
  *) printf 'Comando inesperado: %s\n' "$*" >&2; exit 99 ;;
esac
EOF
printf '#!/bin/bash\nexit 0\n' > "$work/bin/openssl"
chmod +x "$work/bin/"*
export PATH="$work/bin:$PATH" TRACE="$work/trace" EXPECTED_AWS_ACCOUNT_ID=123456789012 EKS_CLUSTER=as-docs-eks
export BACKEND_IMAGE=fixture BACKEND_PRESERVE_AI_OAUTH=false OIDC_AWS_LAB_HTTP=true PUBLIC_APP_URL=http://fixture.test
run() { bash "$work/repo/deploy/apply-aws-backend.sh"; }
run
[[ $(<"$TRACE") == $'trust\nredis\nredis-ready\nbackend\nbackend-ready' ]]
: > "$TRACE"
if MISSING_SECRET=true run; then
  printf 'O helper aceitou credenciais ausentes.\n' >&2; exit 1
fi
[[ ! -s $TRACE ]]
BACKEND_PRESERVE_AI_OAUTH=true ACTIVE_OAUTH=true run
[[ $(<"$TRACE") == $'trust\nredis\nredis-ready\nbackend-ready' ]]
printf 'Deploy do backend: OK\n'
