# Pré-checagem de autoscaling no AWS Academy

O EKS foi entregue com três nós fixos. A mudança é condicionada à verificação na conta do laboratório e deverá manter o máximo de três nós. Este roteiro não altera recursos na AWS nem no Kubernetes. Execute os blocos no CloudShell do Learner Lab (`us-east-1`) e pare se o primeiro bloco falhar.

## 1. Conta, cluster e grupo de nós

```bash
account=$(aws sts get-caller-identity --query Account --output text) &&
  [ "$account" = 967931808920 ] || { printf '%s\n' 'Abra o CloudShell da conta do projeto (967931808920).'; exit 1; }
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 AWS_PAGER=''
cluster=as-docs-eks
nodegroup=as-docs-private-storage
context="arn:aws:eks:${AWS_REGION}:${account}:cluster/${cluster}"
aws eks describe-nodegroup --cluster-name "$cluster" --nodegroup-name "$nodegroup" \
  --query 'nodegroup.{Status:status,Version:version,Role:nodeRole,Scaling:scalingConfig,ASG:resources.autoScalingGroups[].name}'
```

## 2. Escala de pods

```bash
version=$(aws eks describe-cluster --name "$cluster" --query cluster.version --output text) &&
aws eks describe-addon-versions --addon-name metrics-server --kubernetes-version "$version" \
  --query 'addons[].addonVersions[?compatibilities[?defaultVersion]].addonVersion[]'
aws eks list-addons --cluster-name "$cluster"
# Se o contexto ainda não existir, atualiza somente o kubeconfig local:
aws eks update-kubeconfig --name "$cluster"
kubectl --context "$context" api-versions | awk '/^autoscaling\//'
kubectl --context "$context" -n as-docs auth can-i create horizontalpodautoscalers.autoscaling
kubectl --context "$context" top nodes
```

A versão no catálogo indica compatibilidade, não autorização para instalar. `auth can-i` checa a permissão Kubernetes do operador; `top nodes` checa a entrega de métricas. Se o Metrics Server não existir, falta confirmar o caminho de instalação com as permissões do laboratório. Depois da implantação, confirme também `kubectl --context "$context" top pods -n as-docs` e teste o backend com mais de uma réplica antes de considerar a escala operacional.

## 3. Escala de nós

Confira quais permissões a role **do controlador** terá. O exemplo só simula com a role do node group para avaliar a viabilidade de reaproveitá-la no Academy; não autoriza expor essa role aos pods da aplicação. Não execute as operações de escrita do ASG para checar permissões.

```bash
role=$(aws eks describe-nodegroup --cluster-name "$cluster" --nodegroup-name "$nodegroup" --query nodegroup.nodeRole --output text) &&
asg=$(aws eks describe-nodegroup --cluster-name "$cluster" --nodegroup-name "$nodegroup" --query 'nodegroup.resources.autoScalingGroups[0].name' --output text) &&
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$asg" \
  --query 'AutoScalingGroups[].{Arn:AutoScalingGroupARN,Tags:Tags[].{Key:Key,Value:Value}}'
```

Com o ARN retornado, rode a simulação. Se houver `MissingContextValues`, complete o contexto IAM com os valores reais (por exemplo, as tags do ASG) antes de interpretar a decisão. Se a simulação for negada, registre a negativa: não equivale a uma negativa das operações simuladas.

```bash
read -r -p 'ARN do ASG do EKS: ' asg_arn
aws iam simulate-principal-policy --policy-source-arn "$role" \
  --resource-arns "$asg_arn" \
  --action-names autoscaling:SetDesiredCapacity autoscaling:TerminateInstanceInAutoScalingGroup \
  --query 'EvaluationResults[].{Action:EvalActionName,Decision:EvalDecision,Missing:MissingContextValues}'
```

Mesmo `allowed` não prova operação real. Ainda é preciso confirmar a identidade que o Cluster Autoscaler pode usar, suas permissões de leitura e o acesso às APIs AWS; depois, um teste controlado deve observar a criação de um nó quando faltarem recursos para agendar pods, com limite de três, e a redução quando houver capacidade ociosa.

## 4. EC2 do frontend

`infra/edge/frontend.tf` declara duas EC2 individuais, uma em cada subnet pública, com registro individual no target group do ALB. `infra/edge/backend.tf` associa ao NLB o ASG dos nós do EKS, não do frontend. Para confirmar se alguém configurou um grupo do frontend fora do Terraform, rode:

```bash
aws autoscaling describe-auto-scaling-groups \
  --query 'AutoScalingGroups[].{Name:AutoScalingGroupName,TargetGroups:TargetGroupARNs,Instances:Instances[].InstanceId}'
```

Compare com o target group e os IDs de `terraform output -json frontend_instances`, no state da borda. O bootstrap atual prepara Docker e SSM, mas não publica o Nginx. Migrar para um ASG exigiria que novas instâncias subissem já com o frontend e passassem no health check do ALB antes de trocar os alvos atuais. Diagnosticar a ausência do grupo não autoriza essa migração.
