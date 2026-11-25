#!/usr/bin/env bash
# Libera (open) ou remove (close) um CIDR no endpoint público do EKS.
# Mexe apenas no CIDR informado: os demais (ex.: IP do operador) são preservados,
# então o cluster volta exatamente à configuração do Terraform após o close.
# Uso: eks-endpoint.sh open|close <cidr>   (requer EKS_CLUSTER e AWS_REGION)
set -euo pipefail

action=${1:?Informe open ou close}
cidr=${2:?Informe o CIDR}
cluster=${EKS_CLUSTER:?Defina EKS_CLUSTER}

for attempt in $(seq 1 30); do
  current=$(aws eks describe-cluster --name "$cluster" \
    --query 'cluster.resourcesVpcConfig.publicAccessCidrs' --output text | tr '\t' '\n' | sed '/^$/d' | sort -u)

  if [[ $action == open ]]; then
    grep -qxF "$cidr" <<<"$current" && { echo "CIDR $cidr já liberado."; exit 0; }
    new=$(printf '%s\n%s\n' "$current" "$cidr" | sed '/^$/d' | sort -u | paste -sd, -)
  else
    grep -qxF "$cidr" <<<"$current" || { echo "CIDR $cidr já removido."; exit 0; }
    new=$(grep -vxF "$cidr" <<<"$current" | paste -sd, - || true)
  fi

  if [[ -z $new ]]; then
    echo "::error::A lista de CIDRs do endpoint ficaria vazia; abortando."
    exit 1
  fi

  if update_id=$(aws eks update-cluster-config --name "$cluster" \
      --resources-vpc-config "endpointPublicAccess=true,endpointPrivateAccess=true,publicAccessCidrs=$new" \
      --query update.id --output text 2>/tmp/eks-endpoint.err); then
    while :; do
      status=$(aws eks describe-update --name "$cluster" --update-id "$update_id" --query update.status --output text)
      [[ $status == InProgress ]] || break
      sleep 10
    done
    if [[ $status == Successful ]]; then
      echo "Endpoint do EKS: $action $cidr concluído."
      exit 0
    fi
    echo "::warning::Atualização $update_id terminou com status $status; tentando de novo."
  else
    # Outra atualização em andamento (ex.: CD do outro repositório): aguarda e tenta de novo.
    echo "::notice::Tentativa $attempt: $(tr '\n' ' ' </tmp/eks-endpoint.err)"
  fi
  sleep 20
done

echo "::error::Não foi possível aplicar $action $cidr no endpoint do EKS."
exit 1
