#!/usr/bin/env bash
# Constrói as imagens do app e da IA.
#
#   scripts/tcc-build.sh              constrói as duas
#   scripts/tcc-build.sh --app        só o app (tcc-docs-app)
#   scripts/tcc-build.sh --ia         só a IA (tcc-docs-ai)
#   scripts/tcc-build.sh --sem-cache  ignora o cache do Docker (build do zero)
#
# Se a stack estiver no ar, rode scripts/tcc-up.sh depois: ele recria os
# containers com as imagens novas. Pode ser chamado de qualquer pasta.
source "$(dirname "${BASH_SOURCE[0]}")/tcc-common.sh"

usage() { sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

SERVICES=() NO_CACHE=()
for arg in "$@"; do
  case "$arg" in
    --app) SERVICES+=(frontend backend) ;;
    --ia | --ai) SERVICES+=(ai) ;;
    --sem-cache) NO_CACHE=(--no-cache) ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; fail "Opção desconhecida: $arg" ;;
  esac
done
[ ${#SERVICES[@]} -gt 0 ] || SERVICES=(frontend backend ai)

require_docker
require_env
require_ai_repo

info "Construindo: ${SERVICES[*]} (o app leva alguns minutos na primeira vez)..."
started=$SECONDS
compose build "${NO_CACHE[@]}" "${SERVICES[@]}"
elapsed=$((SECONDS - started))

for svc in "${SERVICES[@]}"; do
  case "$svc" in
    frontend) image=as-docs-frontend:local ;;
    backend) image=as-docs-backend:local ;;
    ai) image=as-docs-ai:local ;;
  esac
  docker image inspect "$image" >/dev/null 2>&1 || fail "A imagem $image não foi gerada."
  ok "$image ($(docker image inspect --format '{{.Size}}' "$image" | awk '{printf "%.0f MB", $1/1024/1024}'))"
done
ok "Build concluído em $((elapsed / 60))min$((elapsed % 60))s."

if [ "$(service_status backend)" != "ausente" ] || [ "$(service_status ai)" != "ausente" ]; then
  info "A stack está no ar com as imagens antigas. Para aplicar: scripts/tcc-up.sh"
fi
