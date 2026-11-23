#!/usr/bin/env bash
set -euo pipefail
umask 077
export AWS_PAGER=""

if [[ ! -f backend.tf || ! -f eks.tf || ! -f terraform.tfvars ]]; then
  printf '%s\n' 'Entre na pasta do projeto da rede, já atualizada com a etapa 03.' >&2
  exit 1
fi

AS_DOCS_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
if [[ "$AS_DOCS_ACCOUNT" != "967931808920" ]]; then
  printf '%s\n' 'A sessão AWS não corresponde à conta confirmada para esta infraestrutura.' >&2
  exit 1
fi

AS_DOCS_PUBLIC_IP="$(curl -4 --fail --silent --show-error --max-time 20 https://checkip.amazonaws.com)"
python3 - "$AS_DOCS_PUBLIC_IP" <<'PY'
import ipaddress
import json
import sys
from pathlib import Path

try:
    address = ipaddress.IPv4Address(sys.argv[1].strip())
except ipaddress.AddressValueError:
    raise SystemExit('Não foi possível identificar um IPv4 válido. Nenhum arquivo de acesso foi alterado.')
if not address.is_global:
    raise SystemExit('O endereço retornado não é um IPv4 público. Nenhum arquivo de acesso foi alterado.')

path = Path('eks-acesso.auto.tfvars')
path.write_text('eks_api_access_cidrs = ' + json.dumps([str(address) + '/32']) + '\n')
path.chmod(0o600)
print(f'A API do EKS aceitará o IP público atual do CloudShell: {address}/32')
print('Configuração salva em eks-acesso.auto.tfvars, ignorado pelo Git.')
PY
