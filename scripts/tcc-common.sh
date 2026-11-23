# Funções comuns dos scripts tcc-up.sh, tcc-down.sh e tcc-build.sh.
# Não execute este arquivo diretamente: ele é carregado com `source`.

set -euo pipefail

TCC_APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TCC_ENV_FILE="${TCC_ENV_FILE:-$TCC_APP_DIR/.env}"

if [ -t 1 ]; then
  C_OK=$'\033[32m' C_WARN=$'\033[33m' C_ERR=$'\033[31m' C_DIM=$'\033[2m' C_END=$'\033[0m'
else
  C_OK='' C_WARN='' C_ERR='' C_DIM='' C_END=''
fi

info() { printf '%s\n' "$*"; }
ok() { printf '%s✔%s %s\n' "$C_OK" "$C_END" "$*"; }
warn() { printf '%s!%s %s\n' "$C_WARN" "$C_END" "$*" >&2; }
fail() {
  printf '%s✘ %s%s\n' "$C_ERR" "$*" "$C_END" >&2
  exit 1
}

# docker compose sempre a partir do tcc-docs-app, de qualquer pasta.
compose() {
  docker compose --project-directory "$TCC_APP_DIR" --env-file "$TCC_ENV_FILE" -f "$TCC_APP_DIR/docker-compose.yml" "$@"
}

# Valor de uma variável do .env, sem executar o arquivo e sem imprimir nada.
env_value() {
  local key="$1" line
  [ -f "$TCC_ENV_FILE" ] || return 0
  line="$(grep -E "^[[:space:]]*${key}=" "$TCC_ENV_FILE" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}" line="${line#\"}"
  line="${line%\'}" line="${line#\'}"
  printf '%s' "$line"
}

require_docker() {
  command -v docker >/dev/null 2>&1 || fail "Docker não encontrado."
  docker info >/dev/null 2>&1 || fail "O Docker não está rodando (ou falta permissão). Inicie o serviço do Docker."
  docker compose version >/dev/null 2>&1 || fail "Plugin 'docker compose' não encontrado."
}

# Caminho do repositório da IA, como o docker-compose.yml resolve.
ai_dir() {
  local path
  path="${AS_DOCS_AI_PATH-$(env_value AS_DOCS_AI_PATH)}"
  path="${path:-../As-docs-ai}"
  case "$path" in
    /*) printf '%s' "$path" ;;
    *) (cd "$TCC_APP_DIR" && cd "$path" 2>/dev/null && pwd) || printf '%s/%s' "$TCC_APP_DIR" "$path" ;;
  esac
}

require_ai_repo() {
  local dir
  dir="$(ai_dir)"
  [ -f "$dir/Dockerfile" ] || fail "Repositório da IA não encontrado em $dir (ajuste AS_DOCS_AI_PATH no .env)."
}

# Confere o .env sem nunca mostrar valores.
require_env() {
  [ -f "$TCC_ENV_FILE" ] || fail "Falta $TCC_ENV_FILE. Crie com: cp .env.example .env (e preencha os segredos)."
  local missing=() key
  local required=(APP_SECRET)
  if [ "${DOCS_AI_OAUTH_ENABLED-$(env_value DOCS_AI_OAUTH_ENABLED)}" != true ]; then
    required+=(DOCS_AI_HMAC_SECRET)
  fi
  for key in "${required[@]}"; do
    [ -n "${!key-$(env_value "$key")}" ] || missing+=("$key")
  done
  [ ${#missing[@]} -eq 0 ] || fail "Defina no .env: ${missing[*]} (gere com: openssl rand -hex 32)."

  local perms
  perms="$(stat -c %a "$TCC_ENV_FILE" 2>/dev/null || echo 600)"
  [ "$perms" = "600" ] || warn ".env com permissão $perms; recomendado: chmod 600 $TCC_ENV_FILE"
}

# Modo da IA (com ou sem chave), sem mostrar a chave.
describe_ai_mode() {
  local chat embed model key
  chat="$(env_value AI_CHAT_PROVIDER)"
  embed="$(env_value AI_EMBEDDING_PROVIDER)"
  model="$(env_value OPENAI_MODEL)"
  key="$(env_value OPENAI_API_KEY)"
  chat="${chat:-extractive}" embed="${embed:-hashing}" model="${model:-gpt-6-luna}"
  if [ "$chat" = "openai" ] || [ "$embed" = "openai" ]; then
    [ -n "$key" ] || fail "AI_CHAT_PROVIDER/AI_EMBEDDING_PROVIDER=openai, mas OPENAI_API_KEY está vazio no .env."
    info "IA: OpenAI (chat=$chat, embeddings=$embed, modelo=$model, chave definida)"
  else
    info "IA: modo sem chave (chat=$chat, embeddings=$embed)"
  fi
}

# Status de saúde de um serviço do compose: healthy, starting, unhealthy, running, exited...
service_status() {
  local id
  id="$(compose ps -q "$1" 2>/dev/null || true)"
  [ -n "$id" ] || { printf 'ausente'; return; }
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || printf 'ausente'
}

# Espera os serviços ficarem saudáveis (ou rodando, se não tiverem healthcheck).
wait_healthy() {
  local timeout="$1"
  shift
  local deadline=$((SECONDS + timeout)) pending status svc
  while :; do
    pending=()
    for svc in "$@"; do
      status="$(service_status "$svc")"
      case "$status" in
        healthy | running) ;;
        exited | dead | ausente | unhealthy)
          [ "$status" = unhealthy ] && [ $SECONDS -lt $deadline ] && { pending+=("$svc"); continue; }
          warn "Serviço '$svc' está '$status'. Últimas linhas do log:"
          compose logs --tail 30 "$svc" >&2 || true
          return 1
          ;;
        *) pending+=("$svc") ;;
      esac
    done
    [ ${#pending[@]} -eq 0 ] && return 0
    if [ $SECONDS -ge $deadline ]; then
      warn "Tempo esgotado esperando: ${pending[*]}"
      for svc in "${pending[@]}"; do
        warn "Últimas linhas do log de '$svc':"
        compose logs --tail 30 "$svc" >&2 || true
      done
      return 1
    fi
    printf '%s  aguardando: %s%s\r' "$C_DIM" "${pending[*]}" "$C_END"
    sleep 2
  done
}
