#!/usr/bin/env bash
set -euo pipefail

# Executar depois de configurar e conferir o bucket. Não cria nem altera a rede.
export PATH="$HOME/.local/bin:$PATH"
export AWS_PAGER=""
AS_DOCS_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AS_DOCS_ROOT="${1:-$HOME/as-docs-terraform-etapa-01}"
AS_DOCS_ACCOUNT="967931808920"
AS_DOCS_BUCKET="as-docs-tfstate-967931808920-us-east-1"
AS_DOCS_KEY="as-docs/terraform.tfstate"

cd -- "$AS_DOCS_ROOT"
if [[ ! -s terraform.tfstate ]]; then
  printf '%s\n' 'State local não encontrado. Execute na pasta em que a rede foi aplicada.' >&2
  exit 1
fi
if [[ -e backend.tf ]]; then
  printf '%s\n' 'Já existe backend.tf. Confira o backend atual antes de repetir uma migração.' >&2
  exit 1
fi

AS_DOCS_CURRENT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
if [[ "$AS_DOCS_CURRENT_ACCOUNT" != "$AS_DOCS_ACCOUNT" ]]; then
  printf '%s\n' 'A sessão AWS não corresponde à conta da rede criada.' >&2
  exit 1
fi

# Conferir apenas a identidade da VPC, sem imprimir o conteúdo do state.
python3 - <<'PY'
import json
from pathlib import Path
state = json.loads(Path('terraform.tfstate').read_text())
vpcs = [
    instance.get('attributes', {}).get('id')
    for resource in state.get('resources', [])
    if resource.get('mode') == 'managed' and resource.get('type') == 'aws_vpc' and resource.get('name') == 'main'
    for instance in resource.get('instances', [])
]
if vpcs != ['vpc-04354398b0920234a']:
    raise SystemExit('O state não corresponde à VPC confirmada nesta entrega. Pare e confira a origem.')
PY

aws s3api head-bucket --bucket "$AS_DOCS_BUCKET" \
  --expected-bucket-owner "$AS_DOCS_ACCOUNT" --region us-east-1
AS_DOCS_VERSIONING="$(aws s3api get-bucket-versioning --bucket "$AS_DOCS_BUCKET" \
  --expected-bucket-owner "$AS_DOCS_ACCOUNT" --region us-east-1 --query Status --output text)"
if [[ "$AS_DOCS_VERSIONING" != "Enabled" ]]; then
  printf '%s\n' 'O bucket ainda não tem versionamento habilitado. Conclua a configuração S3.' >&2
  exit 1
fi

aws s3api get-public-access-block --bucket "$AS_DOCS_BUCKET" \
  --expected-bucket-owner "$AS_DOCS_ACCOUNT" --region us-east-1 \
  --query PublicAccessBlockConfiguration --output json | python3 -c '
import json, sys
config = json.load(sys.stdin)
flags = ("BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets")
if not all(config.get(flag) is True for flag in flags):
    raise SystemExit("O bloqueio de acesso público do bucket ainda não está completo.")
'

# Só migrar para uma chave vazia. Um erro de acesso não significa chave inexistente.
AS_DOCS_HEAD_ERROR="$(mktemp /var/tmp/as-docs-state-head.XXXXXX)"
trap 'rm -f -- "$AS_DOCS_HEAD_ERROR"' EXIT
if aws s3api head-object --bucket "$AS_DOCS_BUCKET" --key "$AS_DOCS_KEY" \
  --expected-bucket-owner "$AS_DOCS_ACCOUNT" --region us-east-1 \
  >/dev/null 2>"$AS_DOCS_HEAD_ERROR"; then
  printf '%s\n' 'Já existe state nessa chave S3. Não será sobrescrito por este script.' >&2
  exit 1
elif ! grep -Eq '\(404\)|\(NoSuchKey\)|\(NotFound\)' "$AS_DOCS_HEAD_ERROR"; then
  cat "$AS_DOCS_HEAD_ERROR" >&2
  exit 1
fi

cp -p -- terraform.tfstate "terraform.tfstate.pre-s3-$(date -u +%Y%m%dT%H%M%SZ)"
cp -- "$AS_DOCS_SCRIPT_DIR/backend.tf.example" backend.tf
export TF_DATA_DIR="/var/tmp/as-docs-terraform-data-${UID}"
mkdir -p -m 700 "$TF_DATA_DIR"

printf '%s\n' 'Backup local criado. O Terraform pode pedir confirmação para copiar o state ao S3.'
TMPDIR=/var/tmp terraform init -migrate-state
printf '%s\n' 'Inicialização concluída. Confirme os 22 recursos no state e um plano sem diferenças conforme o README.'
