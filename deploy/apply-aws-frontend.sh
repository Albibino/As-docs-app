#!/usr/bin/env bash
# Execute após o Terraform, com o backend já disponível. Não execute em paralelo.
# Use os outputs frontend_instances (somente os IDs), integration.frontend_target_group,
# backend_url e public_app_url. HTTPS é o padrão; HTTP só para o DNS do ALB do lab.
# O perfil das EC2 precisa de acesso SSM e pull no ECR. Não passe credenciais.
# Gerencia o container as-docs-frontend; não remove containers de outros deploys.
set -euo pipefail

falhar() { printf '%s\n' "$*" >&2; exit 1; }

config=$(python3 - <<'PY'
import json
import os
import re


def exigir(ok, mensagem):
    if not ok:
        raise SystemExit(mensagem)


conta = os.getenv('EXPECTED_AWS_ACCOUNT_ID', '')
exigir(re.fullmatch(r'[0-9]{12}', conta), 'EXPECTED_AWS_ACCOUNT_ID inválido.')
try:
    ids = json.loads(os.getenv('FRONTEND_INSTANCE_IDS', ''))
except ValueError:
    ids = None
exigir(isinstance(ids, list) and len(ids) == 2 and all(
    isinstance(i, str) and re.fullmatch(r'i-(?:[0-9a-f]{8}|[0-9a-f]{17})', i) for i in ids
) and ids[0] != ids[1], 'FRONTEND_INSTANCE_IDS deve ser um array JSON com dois IDs EC2 distintos.')

imagem = os.getenv('FRONTEND_IMAGE', '')
segmento = r'[a-z0-9]+(?:(?:[.-]|_{1,2})[a-z0-9]+)*'
ecr = re.fullmatch(rf'{conta}\.dkr\.ecr\.([a-z]{{2}}(?:-[a-z]+)+-[0-9]+)\.amazonaws\.com/'
                   rf'({segmento}(?:/{segmento})*)@sha256:[0-9a-f]{{64}}', imagem)
exigir(ecr and 2 <= len(ecr[2]) <= 256, 'FRONTEND_IMAGE deve ser um digest sha256 no ECR privado da conta esperada.')
regiao = ecr[1]
arn = os.getenv('FRONTEND_TARGET_GROUP_ARN', '')
exigir(re.fullmatch(rf'arn:aws:elasticloadbalancing:{regiao}:{conta}:targetgroup/'
                    r'[A-Za-z0-9-]{1,32}/[0-9a-f]{16}', arn),
       'FRONTEND_TARGET_GROUP_ARN é obrigatório e deve ser da mesma conta e região do ECR.')

label = r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
host = rf'(?:{label}\.)+{label}'
backend = re.fullmatch(rf'https?://({host})(?::([0-9]{{1,5}}))?', os.getenv('BACKEND_URL', ''))
exigir(backend and len(backend[1]) <= 253 and (backend[2] is None or 1 <= int(backend[2]) <= 65535),
       'BACKEND_URL deve ser a origem HTTP(S) do backend, sem credenciais, caminho ou query.')
publica = os.getenv('PUBLIC_APP_URL', '')
exigir(re.fullmatch(rf'https://{host}', publica) and len(publica) <= 261
       or re.fullmatch(rf'http://as-docs-public-[0-9]+\.{regiao}\.elb\.amazonaws\.com', publica),
       'PUBLIC_APP_URL deve ser uma origem HTTPS ou o DNS HTTP do ALB do laboratório.')
print(regiao, *ids, sep='\n')
PY
) || exit 1
mapfile -t campos <<< "$config"
region=${campos[0]}
ids=("${campos[1]}" "${campos[2]}")

aws_regional() {
  AWS_PAGER='' AWS_CLI_AUTO_PROMPT=off aws "$@" --region "$region" \
    --cli-connect-timeout 5 --cli-read-timeout 15
}

conta=$(aws_regional sts get-caller-identity --query Account --output text)
[[ $conta == "$EXPECTED_AWS_ACCOUNT_ID" ]] || falhar 'A sessão AWS não está na conta esperada.'

ssm=$(aws_regional ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=${ids[0]},${ids[1]}" --output json)
python3 -c '
import json, sys
hosts = json.load(sys.stdin)["InstanceInformationList"]
online = {h["InstanceId"] for h in hosts if h.get("PingStatus") == "Online" and h.get("PlatformType") == "Linux"}
if online != set(sys.argv[1:]):
    sys.exit("As duas instâncias Linux precisam estar online no SSM antes do deploy.")
' "${ids[@]}" <<< "$ssm"

estados_alb() {
  local resposta
  resposta=$(aws_regional elbv2 describe-target-health \
    --target-group-arn "$FRONTEND_TARGET_GROUP_ARN" --output json) || return
  python3 -c '
import json, sys
alvos = json.load(sys.stdin)["TargetHealthDescriptions"]
ids = sys.argv[1:]
if len(alvos) != 2 or {(a["Target"]["Id"], a["Target"]["Port"]) for a in alvos} != {(i, 80) for i in ids}:
    sys.exit("O target group deve conter exatamente as duas instâncias na porta 80.")
estados = {a["Target"]["Id"]: a["TargetHealth"]["State"] for a in alvos}
for i in ids:
    if estados[i] not in ("healthy", "unhealthy", "initial"):
        sys.exit(f"Alvo {i} indisponível para deploy: {estados[i]}")
print(*(estados[i] for i in ids))
' "$@" <<< "$resposta"
}

estados=$(estados_alb "${ids[@]}")
# Se só um alvo atende, atualize o outro primeiro. Dois alvos não saudáveis
# são esperados no bootstrap; o segundo ainda exige que o primeiro fique healthy.
if [[ $estados == 'healthy unhealthy' || $estados == 'healthy initial' ]]; then
  ids=("${ids[1]}" "${ids[0]}")
fi

# O script é enviado como um único item JSON. Só entram origens e imagem públicas
# (sem credenciais); a autorização ECR é obtida dentro da EC2 pelo perfil local.
parametros=$(cat <<'REMOTE' | python3 -c '
import json, shlex, sys
args = " ".join(map(shlex.quote, sys.argv[1:]))
print(json.dumps({"commands": [f"bash -s -- {args} <<\x27AS_DOCS_FRONTEND\x27\n{sys.stdin.read()}AS_DOCS_FRONTEND"],
                  "executionTimeout": ["480"]}))
' "$region" "$FRONTEND_IMAGE" "$BACKEND_URL" "$PUBLIC_APP_URL"
set -euo pipefail
region=$1 image=$2 backend=$3 origin=$4
registry=${image%%/*}
name=as-docs-frontend
backup=${name}-anterior

for cmd in aws docker curl; do
  command -v "$cmd" >/dev/null || { printf 'Comando ausente na EC2: %s\n' "$cmd" >&2; exit 1; }
done

# Configuração temporária: o token não entra nos argumentos, logs ou no SSM.
umask 077
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
trap 'rm -rf -- "$DOCKER_CONFIG"' EXIT
export AWS_PAGER='' AWS_CLI_AUTO_PROMPT=off
aws ecr get-login-password --region "$region" --cli-connect-timeout 5 --cli-read-timeout 15 \
  | docker login --username AWS --password-stdin "$registry" >/dev/null
docker pull "$image"
rm -rf -- "$DOCKER_CONFIG"
unset DOCKER_CONFIG
trap - EXIT

container() { docker ps -a --filter "name=^/$1$" --format '{{.ID}}'; }
old=$(container "$name")
pending=$(container "$backup")
[[ -z $pending ]] || { printf 'Há um container de recuperação pendente.\n' >&2; exit 1; }
candidate=''
restore() {
  local rc=$?
  trap - EXIT
  if (( rc != 0 )); then
    if [[ -n $candidate ]]; then
      docker rm -f "$candidate" >/dev/null || printf 'Falha ao remover o novo container.\n' >&2
    fi
    if [[ -n $old ]]; then
      docker rename "$old" "$name" || printf 'Falha ao restaurar o nome do container anterior.\n' >&2
      docker start "$old" >/dev/null || printf 'Falha ao reiniciar o container anterior.\n' >&2
    fi
  fi
  exit "$rc"
}
trap restore EXIT
if [[ -n $old ]]; then
  docker rename "$old" "$backup"
  docker stop "$old" >/dev/null
fi
candidate=$(docker create --name "$name" --restart unless-stopped --publish 80:8080 \
  --env "BACKEND_URL=$backend" --env "PUBLIC_APP_URL=$origin" --env NGINX_PORT=8080 "$image")
docker start "$candidate" >/dev/null

http_200() {
  local code
  code=$(curl --disable --noproxy '*' --silent --show-error --max-time 3 --output /dev/null \
    --write-out '%{http_code}' "http://127.0.0.1$1") && [[ $code == 200 ]]
}
for ((tentativa=1; tentativa<=20; tentativa++)); do
  if http_200 /healthz && http_200 /api/health/live; then
    trap - EXIT
    if [[ -n $old ]]; then
      docker rm "$old" >/dev/null
    fi
    exit 0
  fi
  sleep 3
done
printf 'O frontend ou a API via proxy não respondeu HTTP 200 na EC2.\n' >&2
exit 1
REMOTE
)

aguardar_ssm() {
  local id=$1 cmd=$2 estado tentativa
  for ((tentativa=1; tentativa<=120; tentativa++)); do
    if estado=$(aws_regional ssm get-command-invocation --command-id "$cmd" --instance-id "$id" \
      --query Status --output text 2>&1); then
      case $estado in
        Success) return 0 ;;
        Pending|InProgress|Delayed|Cancelling) ;;
        *) falhar "SSM falhou para $id ($cmd): $estado. Consulte a saída do Run Command." ;;
      esac
    elif [[ $estado != *'(InvocationDoesNotExist)'* ]]; then
      falhar "Não foi possível consultar o comando SSM $cmd em $id: $estado"
    fi
    sleep 5
  done
  falhar "Tempo de espera do SSM excedido em $id ($cmd); confirme o estado antes de repetir."
}

aguardar_alb() {
  local id=$1 outro=$2 estados tentativa
  for ((tentativa=1; tentativa<=36; tentativa++)); do
    estados=$(estados_alb "$id" "$outro") || return
    if [[ ${estados%% *} == healthy ]]; then
      # Na segunda etapa, confirme também que o primeiro continua saudável.
      [[ $id == "${ids[0]}" || $estados == 'healthy healthy' ]] && return 0
    fi
    sleep 5
  done
  falhar "O ALB não confirmou os alvos esperados como healthy após atualizar $id."
}

for indice in 0 1; do
  id=${ids[indice]}
  outro=${ids[1-indice]}
  estados=$(estados_alb "$id" "$outro")
  estado_anterior=${estados%% *}
  if (( indice == 1 )); then
    [[ ${estados##* } == healthy ]] || falhar "O primeiro alvo deixou de estar healthy; $id não foi atualizado."
  elif [[ $estado_anterior == healthy && ${estados##* } != healthy ]]; then
    falhar "O outro alvo deixou de estar healthy; $id não foi atualizado."
  fi
  printf 'Atualizando %s via SSM...\n' "$id"
  comando=$(aws_regional ssm send-command --instance-ids "$id" \
    --document-name AWS-RunShellScript --comment 'Deploy do frontend As-docs' \
    --timeout-seconds 60 --parameters "$parametros" --query Command.CommandId --output text)
  [[ $comando =~ ^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$ ]] || falhar 'O SSM não retornou um ID de comando válido.'
  aguardar_ssm "$id" "$comando"
  # O ALB pode ainda mostrar o healthy do container anterior. Para um alvo
  # já saudável, aguarde o limiar da borda (3 checagens de 30 s, timeout 5 s).
  if [[ $estado_anterior == healthy ]]; then sleep 100; fi
  aguardar_alb "$id" "$outro"
  printf '%s: frontend e API verificados na EC2; alvo healthy no ALB.\n' "$id"
done
