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

use_oidc="${OIDC_ENABLED-$(env_value OIDC_ENABLED)}"
use_oauth="${DOCS_AI_OAUTH_ENABLED-$(env_value DOCS_AI_OAUTH_ENABLED)}"
profile=() services=(db backend frontend ai)
if [ "$use_oidc" = true ] || [ "$use_oauth" = true ]; then
  profile=(--profile oidc)
  services+=(keycloak)
fi
if [ "$SEED" -eq 1 ] && [ "$use_oidc" = true ]; then
  fail "--seed usa o seletor legado e não funciona com OIDC ativo."
fi

for image in as-docs-frontend:local as-docs-backend:local as-docs-ai:local; do
  docker image inspect "$image" >/dev/null 2>&1 \
    || fail "Imagem $image não existe. Rode: scripts/tcc-build.sh (ou scripts/tcc-up.sh --build)."
done

info "Subindo: ${services[*]}..."
compose "${profile[@]}" up -d --no-build --wait --wait-timeout 180 "${services[@]}"

app_url="${APP_URL-$(env_value APP_URL)}"
app_url="${app_url:-http://localhost:8080}"
if [ "$SEED" -eq 1 ]; then
  info "Criando páginas de exemplo..."
  python3 "$TCC_APP_DIR/scripts/tcc-seed-demo.py" "${app_url%/}"
fi

ok "Pronto: $app_url"
info "${C_DIM}Logs: docker compose logs -f backend ai   |   Parar: scripts/tcc-down.sh${C_END}"
