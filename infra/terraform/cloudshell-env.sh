#!/usr/bin/env bash
# Carregar com: source ./cloudshell-env.sh
# Somente dados regeneráveis do Terraform vão para o armazenamento temporário.

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  printf '%s\n' 'Execute com: source ./cloudshell-env.sh' >&2
  exit 1
fi

if [[ ! -f versions.tf || ! -f terraform.tfvars ]]; then
  printf '%s\n' 'Entre na pasta do projeto antes de carregar este arquivo.' >&2
  return 1
fi

export PATH="$HOME/.local/bin:$PATH"
export TF_DATA_DIR="/var/tmp/as-docs-terraform-data-${UID}"
mkdir -p -m 700 "$TF_DATA_DIR" || return 1
printf 'Dados regeneráveis do Terraform: %s\n' "$TF_DATA_DIR"
printf '%s\n' 'O state local continua na pasta do projeto.'
