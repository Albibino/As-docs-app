#!/usr/bin/env bash
# Executa o helper real e renderiza o Secret com kubectl client-side, sem AWS.
set -euo pipefail
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
export REAL_KUBECTL=$(command -v kubectl) TEST_TRACE="$work/trace"
cat > "$work/aws" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ ! -v OPENAI_API_KEY ]]
case "$1 $2" in
  'sts get-caller-identity') printf '%s\n' "${TEST_ACCOUNT:-123456789012}" ;;
  'eks update-kubeconfig') : ;;
  *) exit 3 ;;
esac
EOF
cat > "$work/kubectl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ ! -v OPENAI_API_KEY && $1 == --context && $2 == arn:aws:eks:us-east-1:123456789012:cluster/as-docs-eks ]]
case " $* " in
  *' get namespace as-docs '*)
    if [[ ${NAMESPACE_EXISTS:-false} == true ]]; then echo namespace/as-docs; fi ;;
  *' create namespace as-docs '*)
    printf 'namespace\n' >> "$TEST_TRACE" ;;
  *' create secret generic as-docs-ai-openai '*)
    [[ " $* " == *' -n as-docs '* && " $* " == *' --dry-run=client '* ]]
    for arg; do [[ $arg != *fixture* ]]; done
    shift 2
    exec "$REAL_KUBECTL" --kubeconfig=/dev/null "$@" ;;
  *' apply --server-side --field-manager=as-docs-lab-openai -f - '*)
    python3 -c 'import base64,json,sys; obj=json.load(sys.stdin); assert obj["metadata"]["namespace"]=="as-docs" and obj["metadata"]["name"]=="as-docs-ai-openai" and obj["type"]=="Opaque"; assert {k:base64.b64decode(v).decode() for k,v in obj["data"].items()} == {"OPENAI_API_KEY":"fixture-$special=key"}'
    printf 'secret\n' >> "$TEST_TRACE"
    if [[ ${APPLY_FAIL:-false} == true ]]; then exit 1; fi ;;
  *' get secret as-docs-ai-openai '*)
    echo secret/as-docs-ai-openai ;;
  *) exit 99 ;;
esac
EOF
chmod +x "$work"/{aws,kubectl}
export PATH="$work:$PATH" EXPECTED_AWS_ACCOUNT_ID=123456789012 EKS_CLUSTER=as-docs-eks
run() { OPENAI_API_KEY='fixture-$special=key' bash "$root/deploy/apply-aws-openai-secret.sh"; }
run
[[ $(<"$TEST_TRACE") == $'namespace\nsecret' ]]
: > "$TEST_TRACE"
NAMESPACE_EXISTS=true run
[[ $(<"$TEST_TRACE") == secret ]]
: > "$TEST_TRACE"
if TEST_ACCOUNT=999999999999 run; then exit 1; fi
[[ ! -s $TEST_TRACE ]]
if NAMESPACE_EXISTS=true APPLY_FAIL=true run; then exit 1; fi
printf 'Secret OpenAI: namespace, valor no stdin, conta e falha de apply verificados.\n'

# Exercita a configuração real com o provider builtin em uma raiz isolada.
lab="$work/infra/lab"
mkdir -p "$lab/base" "$work/deploy"
cp "$root/infra/lab/openai.tf" "$lab/"
cp "$root/deploy/apply-aws-openai-secret.sh" "$work/deploy/"
printf '%s\n' 'output "eks_cluster_name" { value = "as-docs-eks" }' > "$lab/base/outputs.tf"
cat > "$lab/fixtures.tf" <<'EOF'
locals { account_id = "123456789012" }
module "base" { source = "./base" }
resource "terraform_data" "account" { input = local.account_id }
EOF
cat > "$lab/openai.auto.tfvars" <<'EOF'
openai_secret_revision = 1
openai_api_key = "fixture-$special=key"
EOF
export TF_DATA_DIR="$work/terraform-data"
terraform -chdir="$lab" init -backend=false -no-color >/dev/null
terraform -chdir="$lab" plan -input=false -no-color -out=lab.tfplan > "$work/plan.log"
: > "$TEST_TRACE"
terraform -chdir="$lab" apply -input=false -no-color lab.tfplan > "$work/apply.log"
[[ $(<"$TEST_TRACE") == $'namespace\nsecret' ]]
python3 - "$lab" "$work" <<'PY'
import pathlib, sys, zipfile
lab, work = map(pathlib.Path, sys.argv[1:])
key = b'fixture-$special=key'
with zipfile.ZipFile(lab/'lab.tfplan') as plan:
    assert all(key not in plan.read(entry) for entry in plan.namelist())
for path in [lab/'terraform.tfstate', work/'plan.log', work/'apply.log']:
    assert key not in path.read_bytes(), f'Chave presente em {path.name}'
PY
printf 'Terraform: arquivo automático entregue; chave ausente do plano, state e logs.\n'
