#!/usr/bin/env bash
set -euo pipefail
umask 077
export AWS_PAGER=""

# O Academy bloqueou a leitura de Object Lock pelo recurso aws_s3_bucket.
# Este helper configura somente um bucket já existente e da conta confirmada.
# Não cria/exclui bucket, não consulta Object Lock e não altera políticas IAM/SCP.
AS_DOCS_BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AS_DOCS_BUCKET="as-docs-tfstate-967931808920-us-east-1"
AS_DOCS_ACCOUNT="967931808920"
AS_DOCS_REGION="us-east-1"

AS_DOCS_CURRENT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
if [[ "$AS_DOCS_CURRENT_ACCOUNT" != "$AS_DOCS_ACCOUNT" ]]; then
  printf '%s\n' 'A sessão AWS não corresponde à conta da rede. Nenhuma configuração foi alterada.' >&2
  exit 1
fi

aws s3api head-bucket --bucket "$AS_DOCS_BUCKET" \
  --expected-bucket-owner "$AS_DOCS_ACCOUNT" --region "$AS_DOCS_REGION"

# Se o bucket não existir, estiver em outra conta ou não for acessível, o
# comando acima interrompe. Não interpretar um 403 como ausência do bucket.
AS_DOCS_BACKUP_DIR="$(mktemp -d "$AS_DOCS_BOOTSTRAP_DIR/backup-local-XXXXXXXX")"
for AS_DOCS_FILE in terraform.tfstate terraform.tfstate.backup state.tfplan; do
  if [[ -f "$AS_DOCS_BOOTSTRAP_DIR/$AS_DOCS_FILE" ]]; then
    cp -p -- "$AS_DOCS_BOOTSTRAP_DIR/$AS_DOCS_FILE" "$AS_DOCS_BACKUP_DIR/$AS_DOCS_FILE"
  fi
done
printf 'Arquivos locais existentes preservados em: %s\n' "$AS_DOCS_BACKUP_DIR"

AS_DOCS_PREVIOUS_VERSIONING="$(aws s3api get-bucket-versioning --bucket "$AS_DOCS_BUCKET" \
  --expected-bucket-owner "$AS_DOCS_ACCOUNT" --region "$AS_DOCS_REGION" \
  --query Status --output text)"

aws s3api put-public-access-block --bucket "$AS_DOCS_BUCKET" \
  --expected-bucket-owner "$AS_DOCS_ACCOUNT" --region "$AS_DOCS_REGION" \
  --public-access-block-configuration \
  'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'

aws s3api put-bucket-encryption --bucket "$AS_DOCS_BUCKET" \
  --expected-bucket-owner "$AS_DOCS_ACCOUNT" --region "$AS_DOCS_REGION" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

if [[ "$AS_DOCS_PREVIOUS_VERSIONING" != "Enabled" ]]; then
  aws s3api put-bucket-versioning --bucket "$AS_DOCS_BUCKET" \
    --expected-bucket-owner "$AS_DOCS_ACCOUNT" --region "$AS_DOCS_REGION" \
    --versioning-configuration Status=Enabled
fi

printf '%s\n' 'Conferindo as configurações aplicadas:'
aws s3api get-public-access-block --bucket "$AS_DOCS_BUCKET" \
  --expected-bucket-owner "$AS_DOCS_ACCOUNT" --region "$AS_DOCS_REGION" \
  --query PublicAccessBlockConfiguration --output json
aws s3api get-bucket-encryption --bucket "$AS_DOCS_BUCKET" \
  --expected-bucket-owner "$AS_DOCS_ACCOUNT" --region "$AS_DOCS_REGION" \
  --query ServerSideEncryptionConfiguration --output json
aws s3api get-bucket-versioning --bucket "$AS_DOCS_BUCKET" \
  --expected-bucket-owner "$AS_DOCS_ACCOUNT" --region "$AS_DOCS_REGION" --output json

if [[ "$AS_DOCS_PREVIOUS_VERSIONING" != "Enabled" ]]; then
  printf '%s\n' 'O versionamento foi habilitado agora. Aguarde 15 minutos antes da migração do state, conforme orientação da AWS.'
fi
printf '%s\n' 'Configuração S3 concluída. A migração do state da rede é uma etapa separada; não reaplique o bootstrap Terraform anterior.'
