#!/usr/bin/env bash
# Sobe o app e a IA (com Postgres e Redis) e espera tudo ficar saudável.
#
#   scripts/tcc-up.sh            sobe com as imagens já construídas
#   scripts/tcc-up.sh --build    constrói antes de subir
#   scripts/tcc-up.sh --seed     depois de subir, cria as páginas de exemplo
#
# Pode ser chamado de qualquer pasta.
source "$(dirname "${BASH_SOURCE[0]}")/tcc-common.sh"

usage() { sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

BUILD=0 SEED=0
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=1 ;;
    --seed) SEED=1 ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; fail "Opção desconhecida: $arg" ;;
  esac
done

require_docker
require_env
require_ai_repo
describe_ai_mode

if [ "$BUILD" -eq 1 ]; then
  "$TCC_APP_DIR/scripts/tcc-build.sh"
fi

# Sem imagem local, o compose tentaria baixar "tcc-docs-app:local" de um registro.
for image in tcc-docs-app:local tcc-docs-ai:local; do
  docker image inspect "$image" >/dev/null 2>&1 \
    || fail "Imagem $image não existe. Rode: scripts/tcc-build.sh (ou scripts/tcc-up.sh --build)."
done

info "Subindo app, IA, Postgres e Redis..."
compose up -d --no-build

if ! wait_healthy 180 db app ai; then
  fail "A stack não ficou saudável. Veja os logs acima ou: docker compose logs app ai"
fi
printf '\033[K'
ok "app: $(service_status app) | ia: $(service_status ai) | postgres: $(service_status db) | redis: $(service_status redis)"

if [ "$SEED" -eq 1 ]; then
  info "Criando páginas de exemplo..."
  python3 "$TCC_APP_DIR/scripts/tcc-seed-demo.py" "$(env_value APP_URL | sed 's:/*$::' | grep . || echo http://localhost:3001)"
fi

app_url="$(env_value APP_URL)"
ok "Pronto: ${app_url:-http://localhost:3001} (escolha \"Usuário 1\")"
info "${C_DIM}Logs: docker compose logs -f app ai   |   Parar: scripts/tcc-down.sh${C_END}"
