#!/usr/bin/env bash
set -euo pipefail

script=$(cd -- "$(dirname -- "$0")/.." && pwd)/apply-keycloak.sh
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

cat > "$work/aws" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "$1 $2" in
  'sts get-caller-identity') echo "$EXPECTED_AWS_ACCOUNT_ID" ;;
  'eks update-kubeconfig') : ;;
  *) exit 2 ;;
esac
EOF
cat > "$work/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ " $* " == *' https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem '* ]]
[[ ${FAIL_DOWNLOAD:-false} == false ]] || exit 22
printf 'public-rds-ca\n'
EOF
cat > "$work/kubectl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ $1 == --context && $2 == arn:aws:eks:us-east-1:123456789012:cluster/lab ]]
case " $* " in
  *' create configmap as-docs-keycloak-rds-ca '*)
    [[ " $* " == *' -n as-docs-identity '* && " $* " == *' --dry-run=client '* ]]
    for arg; do
      if [[ $arg == --from-file=ca.pem=* ]]; then
        [[ $(<"${arg#--from-file=ca.pem=}") == public-rds-ca ]]
        printf 'configmap-with-rds-ca\n'
        exit 0
      fi
    done
    exit 2 ;;
  *' apply '*)
    input=$(cat)
    if [[ $input == configmap-with-rds-ca ]]; then
      printf 'ca\n' >> "$CALLS"
    elif [[ $input == "$KEYCLOAK_MANIFEST" ]]; then
      [[ -s $CALLS ]] || { printf 'A CA deve ser aplicada antes do manifesto.\n' >&2; exit 1; }
      printf 'manifest\n' >> "$CALLS"
    else
      exit 2
    fi ;;
  *' get namespace as-docs-identity '*|*' get secret as-docs-keycloak-db as-docs-keycloak-tls '*|*' rollout status deployment/as-docs-keycloak '*) : ;;
  *' get configmap as-docs-keycloak-rds-ca '*) printf 'A CA não deve ser um pré-requisito manual.\n' >&2; exit 1 ;;
  *) exit 2 ;;
esac
EOF
chmod +x "$work"/{aws,curl,kubectl}
export PATH="$work:$PATH" EXPECTED_AWS_ACCOUNT_ID=123456789012 EKS_CLUSTER=lab
export CALLS="$work/calls" KEYCLOAK_MANIFEST='keycloak-manifest'

bash "$script"
[[ $(<"$CALLS") == $'ca\nmanifest\nmanifest' ]]

: > "$CALLS"
if FAIL_DOWNLOAD=true bash "$script"; then
  printf 'O provisionador aceitou uma falha de download.\n' >&2
  exit 1
fi
[[ ! -s $CALLS ]]
printf 'Bootstrap da CA do RDS: OK\n'
