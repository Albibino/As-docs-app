#!/usr/bin/env bash
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  printf '%s\n' 'Carregue com: source ./cloudshell-env.sh' >&2
  exit 1
fi
export PATH="$HOME/.local/bin:$PATH"
# Mesmo provider/cache da rede: evita duplicar o binario de cerca de 800 MB.
export TF_DATA_DIR="/var/tmp/as-docs-database-data-${UID}"
export TMPDIR=/var/tmp
mkdir -p -m 700 "$TF_DATA_DIR" || return 1
if [[ -d "/var/tmp/as-docs-terraform-data-${UID}/providers" && ! -e "$TF_DATA_DIR/providers" ]]; then
  ln -s "/var/tmp/as-docs-terraform-data-${UID}/providers" "$TF_DATA_DIR/providers" || return 1
fi
printf '%s\n' 'Ambiente carregado. Este diretorio usa a chave S3 as-docs/database.tfstate.'
