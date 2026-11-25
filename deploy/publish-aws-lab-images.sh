#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077
export AWS_PAGER=""
root=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
fail() { printf '%s\n' "$*" >&2; exit 1; }

# 0: digest válido; 1: tag inexistente; 2: resposta inesperada/falha da AWS.
lookup() {
  local service=$1 tag=$2 output
  if output=$(aws ecr describe-images --region "$region" --registry-id "$account" \
    --repository-name "as-docs-$service" --image-ids "imageTag=$tag" \
    --query 'imageDetails[0].imageDigest' --output text 2>&1); then
    if [[ $output =~ ^sha256:[0-9a-f]{64}$ ]]; then return 0; fi
    printf 'Digest inválido no ECR para %s.\n' "$service" >&2
  elif [[ $output == *'(ImageNotFoundException)'* ]]; then
    return 1
  else
    printf '%s\n' "$output" >&2
  fi
  return 2
}

# Copia só entradas de build permitidas, a partir dos arquivos no índice Git
# e usando o conteúdo da árvore de trabalho. Não copie configuração privada de npm.
snapshot() {
  python3 - "$@" <<'PY'
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
from pathlib import Path

action, kind, directory, *destination = sys.argv[1:]
src = Path(directory).resolve()
dst = Path(destination[0]) if destination else None
if kind not in ('app', 'ai'):
    raise SystemExit('Tipo de contexto inválido.')

def git(*args):
    return subprocess.check_output(['git', '-C', str(src), *args])

if Path(os.fsdecode(git('rev-parse', '--show-toplevel').rstrip(b'\n'))).resolve() != src:
    raise SystemExit('O contexto deve partir da raiz de um checkout Git.')

excluded = re.compile(
    r'(^|/)(?:\.env[^/]*|\.npmrc|\.git|\.terraform|node_modules|dist|coverage|logs|'
    r'\.cache|\.nx|__pycache__)(/|$)|'
    r'\.(?:pyc|pem|key|crt|p12|pfx|jks|tfplan|tfvars(?:\.json)?|tfstate[^/]*)$', re.I
)
if kind == 'app':
    roots = ('.dockerignore', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'nx.json')
    paths = ('apps/client/', 'apps/server/', 'packages/', 'frontend/', 'backend/')
    required = set(roots) | {
        'frontend/Dockerfile', 'backend/Dockerfile', 'frontend/nginx/default.conf.template',
        'frontend/nginx/security-headers.conf', 'apps/client/package.json',
        'apps/server/package.json', 'packages/editor-ext/package.json',
    }
    # Nenhuma exceção para arquivos não rastreados do app.
    pending = set()
else:
    roots = ('Dockerfile', '.dockerignore', 'pyproject.toml', 'uv.lock', 'README.md')
    paths = ('src/',)
    # config.py e oauth.py já importam este módulo da entrega AWS em andamento.
    pending = {'src/tcc_docs_ai/oidc_config.py'}
    required = set(roots) - {'uv.lock'} | pending

def inputs(*args):
    return {
        name for raw in git('ls-files', '-z', *args).split(b'\0') if raw
        if ((name := os.fsdecode(raw)) in roots or name.startswith(paths)
            or (kind == 'app' and re.fullmatch(r'tsconfig[^/]*\.json', name)))
        and not excluded.search(name)
    }

tracked = inputs('--cached')
untracked = inputs('--others', '--exclude-standard')
if unexpected := untracked - pending:
    raise SystemExit(f'Entrada de build não rastreada em {kind}; revise e adicione ao índice Git: {sorted(unexpected)!r}')

if dst:
    dst.mkdir()
digests = {}
for name in sorted(tracked | (untracked & pending)):
    rel = Path(name)
    for path in (src / part for part in (*reversed(rel.parents), rel)):
        if path.is_symlink():
            raise SystemExit(f'Symlink não permitido no contexto {kind}: {name!r}')
    source = src / rel
    try:
        mode = source.stat().st_mode
    except FileNotFoundError:
        continue
    if not stat.S_ISREG(mode):
        raise SystemExit(f'Entrada de build não é um arquivo regular em {kind}: {name!r}')
    if dst:
        target = dst / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        source = target
    digests[name] = hashlib.sha256(source.read_bytes()).hexdigest()
if absent := required - digests.keys():
    raise SystemExit(f'Entradas obrigatórias ausentes no contexto {kind}: {sorted(absent)!r}')
if action == '--build-inputs':
    print(json.dumps(digests))
elif action == '--build-manifest':
    print(json.dumps(list(digests), ensure_ascii=False, indent=2))
else:
    entries = ''.join(f'{hashlib.sha256(name.encode()).hexdigest()}:{digest}\n'
                      for name, digest in digests.items())
    print(hashlib.sha256(entries.encode()).hexdigest())
PY
}

if [[ ${1-} == --build-inputs || ${1-} == --build-manifest ]]; then
  [[ $# == 3 ]] || fail 'Informe o tipo de contexto e a raiz do checkout.'
  snapshot "$@"
  exit
fi

account=${EXPECTED_AWS_ACCOUNT_ID:?}
region=us-east-1
registry="$account.dkr.ecr.$region.amazonaws.com"
services=(frontend backend ai)
[[ $account =~ ^[0-9]{12}$ ]] || fail 'ID da conta AWS inválido.'
for service in "${services[@]}"; do
  repo=${service^^}_REPO; tag=${service^^}_TAG
  [[ ${!repo-} == "$registry/as-docs-$service" && ${!tag-} =~ ^lab-[0-9a-f]{24}$ ]] ||
    fail "Repositório ou tag inválida para $service."
done
[[ $(snapshot fingerprint app "$root") == "${APP_BUILD_FINGERPRINT:?}" ]] ||
  fail 'Contexto app difere do plano; confira o manifesto e rode terraform plan novamente.'
[[ $(snapshot fingerprint ai "${TCC_DOCS_AI_PATH:?}") == "${AI_BUILD_FINGERPRINT:?}" ]] ||
  fail 'Contexto IA difere do plano; confira o manifesto e rode terraform plan novamente.'
[[ $(aws sts get-caller-identity --region "$region" --query Account --output text) == "$account" ]] ||
  fail 'A sessão AWS não corresponde à conta esperada.'

missing=()
for service in "${services[@]}"; do
  tag=${service^^}_TAG
  if lookup "$service" "${!tag}"; then
    printf 'Imagem já publicada: %s\n' "$service"
  else
    [[ $? == 1 ]] || exit 1
    missing+=("$service")
  fi
done
((${#missing[@]})) || exit 0

work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

app_needed=false
for service in "${missing[@]}"; do
  if [[ $service == ai ]]; then
    [[ $(snapshot fingerprint ai "$TCC_DOCS_AI_PATH" "$work/ai") == "$AI_BUILD_FINGERPRINT" ]] ||
      fail 'Contexto IA mudou antes do build.'
  else
    app_needed=true
  fi
done
if $app_needed; then
  [[ $(snapshot fingerprint app "$root" "$work/app") == "$APP_BUILD_FINGERPRINT" ]] ||
    fail 'Contexto app mudou antes do build.'
fi

export DOCKER_CONFIG="$work/docker-config"
mkdir "$DOCKER_CONFIG"
# A entrada vazia evita a seleção automática de um helper de credenciais do host.
printf '{"auths":{"%s":{}}}\n' "$registry" >"$DOCKER_CONFIG/config.json"
# O token fica só no config temporário; cada EC2 usa seu próprio perfil para pull.
aws ecr get-login-password --region "$region" | docker login --username AWS --password-stdin "$registry" >/dev/null
for service in "${missing[@]}"; do
  repo=${service^^}_REPO; tag=${service^^}_TAG; image="${!repo}:${!tag}"
  directory="$work/app"; dockerfile="$directory/$service/Dockerfile"
  if [[ $service == ai ]]; then directory="$work/ai"; dockerfile="$directory/Dockerfile"; fi
  docker build --platform linux/amd64 -f "$dockerfile" -t "$image" "$directory"
  # Os repositórios são IMMUTABLE no Terraform. Se outro publicador já gravou
  # a tag durante o build, aceite apenas um digest confirmado no repositório.
  if ! docker push "$image"; then
    lookup "$service" "${!tag}" || fail "Falha ao publicar $image."
    printf 'Imagem publicada por outra execução: %s\n' "$service"
  else
    lookup "$service" "${!tag}" || fail "Publicação não confirmada no ECR: $image."
  fi
done
