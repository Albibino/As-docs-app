#!/usr/bin/env bash
set -Eeuo pipefail

NAME='as-docs-frontend'
BACKUP="${NAME}-backup-$(date +%s)"
AWS_REGION='us-east-1'
ECR_PREFIX='362749056012.dkr.ecr.us-east-1.amazonaws.com/as-docs-frontend:'

: "${NEW_IMAGE:?A imagem nova e obrigatoria}"

case "$NEW_IMAGE" in
  "${ECR_PREFIX}"*) ;;
  *) echo 'ERRO: imagem fora do ECR esperado'; exit 1 ;;
esac

command -v aws >/dev/null || {
  echo 'ERRO: AWS CLI ausente nesta EC2'
  exit 1
}

command -v docker >/dev/null || {
  echo 'ERRO: Docker ausente nesta EC2'
  exit 1
}

docker inspect "$NAME" >/dev/null

OLD_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$NAME")"
ENV_FILE="$(mktemp /tmp/asdocs-frontend-env.XXXXXXXX)"
chmod 600 "$ENV_FILE"

SWAPPED=0
FINISHED=0

cleanup() {
  code=$?
  trap - EXIT

  if [ "$FINISHED" -ne 1 ] && [ "$SWAPPED" -eq 1 ]; then
    echo 'ERRO: tentando restaurar o container anterior'

    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker rename "$BACKUP" "$NAME" || true
    docker start "$NAME" || true
  fi

  rm -f "$ENV_FILE"
  exit "$code"
}

trap cleanup EXIT

echo "Imagem antiga: $OLD_IMAGE"
echo "Imagem nova: $NEW_IMAGE"

# Preserva os valores das variaveis sem exibi-los no SSM.
docker inspect \
  --format '{{range .Config.Env}}{{println .}}{{end}}' \
  "$NAME" > "$ENV_FILE"

# Baixa a imagem antes de interromper o frontend.
aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "${ECR_PREFIX%%/*}"

docker pull "$NEW_IMAGE"

# Mantem o container antigo disponivel para restauracao.
docker rename "$NAME" "$BACKUP"
SWAPPED=1

docker stop "$BACKUP"

docker run -d \
  --name "$NAME" \
  --restart unless-stopped \
  -p 80:8080 \
  --env-file "$ENV_FILE" \
  "$NEW_IMAGE"

HEALTHY=0

for attempt in $(seq 1 40); do
  status="$(docker inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "$NAME")"

  if [ "$status" = healthy ]; then
    HEALTHY=1
    break
  fi

  if [ "$status" = unhealthy ]; then
    break
  fi

  sleep 3
done

if [ "$HEALTHY" -ne 1 ]; then
  echo 'ERRO: frontend nao atingiu status healthy'
  exit 1
fi

docker rm "$BACKUP"
FINISHED=1

echo 'SUCESSO: frontend atualizado e saudavel nesta instancia'