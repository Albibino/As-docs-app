#!/usr/bin/env bash
# Derruba o app e a IA (com Postgres e Redis).
#
#   scripts/tcc-down.sh                 para tudo e MANTÉM os dados (páginas, índice)
#   scripts/tcc-down.sh --apagar-dados  para tudo e APAGA banco, índice e arquivos
#   scripts/tcc-down.sh --apagar-dados --sim   idem, sem pedir confirmação
#
# Pode ser chamado de qualquer pasta.
source "$(dirname "${BASH_SOURCE[0]}")/tcc-common.sh"

usage() { sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

WIPE=0 YES=0
for arg in "$@"; do
  case "$arg" in
    --apagar-dados) WIPE=1 ;;
    --sim | -y) YES=1 ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; fail "Opção desconhecida: $arg" ;;
  esac
done

require_docker

if [ "$WIPE" -eq 1 ]; then
  if [ "$YES" -ne 1 ]; then
    if [ ! -t 0 ]; then
      fail "--apagar-dados sem terminal interativo: confirme com --sim."
    fi
    printf 'Isso apaga TODAS as páginas, o índice da IA e os arquivos enviados. Digite "apagar" para confirmar: '
    read -r answer
    [ "$answer" = "apagar" ] || fail "Cancelado. Nada foi apagado."
  fi
  info "Derrubando e apagando os dados..."
  compose down -v --remove-orphans
  ok "Parado. Dados apagados; o próximo scripts/tcc-up.sh começa do zero (use --seed para criar exemplos)."
else
  info "Derrubando app, IA, Postgres e Redis (os dados ficam guardados)..."
  compose down --remove-orphans
  ok "Parado. Para subir de novo: scripts/tcc-up.sh"
fi
