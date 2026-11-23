# Etapa 03 — EKS com três nós privados

A rede de 22 recursos e seu backend S3 já foram aplicados e verificados no
Academy. EKS e NAT também foram aplicados na mesma configuração, VPC, conta e
state: 13 adições, nenhuma alteração ou exclusão. Validate e testes simulados
passaram no CloudShell. A conferência Kubernetes confirmou três nós `Ready`,
todos sem IP público, e pods do sistema `Running`. O plano após a retomada
retornou `No changes`. Veja [VERIFICACAO_EKS.md](VERIFICACAO_EKS.md).

## Pré-requisitos confirmados pelo usuário

- Conta `967931808920`, região `us-east-1`, VPC `vpc-04354398b0920234a`.
- Cluster role: confiança em `eks.amazonaws.com`, com `AmazonEKSClusterPolicy`.
- Node role: confiança em `ec2.amazonaws.com`, com `AmazonEKSWorkerNodePolicy`,
  `AmazonEC2ContainerRegistryReadOnly` e `AmazonEKS_CNI_Policy`.
- Sem políticas inline nas duas funções.
- `describe-cluster-versions --default-only` retornou `1.37`, `STANDARD_SUPPORT`.
- William confirmou três nós EKS. A entrega inicial usa três `t3.medium`
  On-Demand com AL2023 x86_64, 20 GiB gp3 criptografados por nó, sem IP público.

Nenhuma função ou política IAM é criada/anexada por este código. As funções
existentes já estão no `terraform.tfvars` do projeto.

## Recursos novos esperados

| Recurso Terraform | Quantidade |
|---|---:|
| Elastic IP para NAT | 2 |
| NAT Gateway, um por zona | 2 |
| Rota privada para o NAT da mesma zona | 2 |
| Grupo de logs do cluster, retenção de 7 dias | 1 |
| Cluster EKS 1.37 | 1 |
| Launch template dos nós | 1 |
| Node group com tamanho mínimo/desejado/máximo 3 | 1 |
| Add-ons gerenciados: VPC CNI, kube-proxy e CoreDNS | 3 |
| **Total de adições gerenciadas pelo Terraform** | **13** |

O plano aplicado preservou os 22 recursos e acrescentou 13: **13 adições,
0 alterações e 0 exclusões**. A criação do node group também faz o EKS criar
recursos subordinados, como ASG, instâncias e interfaces; esses itens não são
recursos Terraform independentes deste plano.

Os nós começam com os componentes de rede instalados pelo EKS. Os três add-ons
são convertidos para gerenciados após o node group ficar ativo. O VPC CNI recebe
`enableNetworkPolicy = "true"`, necessário às políticas dos manifests recebidos.
As versões são consultadas para a versão Kubernetes configurada, escolhendo as
versões padrão recomendadas pela API, não uma lista de versões fixada por palpite.

## Preparar o acesso à API

A API tem endpoint privado para os nós e endpoint público limitado a IPv4 `/32`
dos operadores. `preparar-eks.sh` confere a conta e consulta o IP de saída atual
do CloudShell. Ele grava `eks-acesso.auto.tfvars`, ignorado pelo Git.

Não é permitido `0.0.0.0/0`. Se o IP do CloudShell mudar numa nova sessão,
execute novamente o helper e planeje a atualização da lista. Outros executores
precisam de uma sessão AWS autorizada e de seu endereço na lista da API para usar
o Kubernetes. Os comandos de API AWS do EKS e os comandos Kubernetes têm acessos
distintos.

## 1. Atualizar o projeto no CloudShell

Envie `As_docs_Terraform_Etapa_03_EKS.zip`. O ZIP contém a pasta
`as-docs-terraform-etapa-01` atualizada, sem states, planos ou providers.
Ele não contém o arquivo local de IP nem credenciais.

```bash
cd "$HOME"
unzip -o As_docs_Terraform_Etapa_03_EKS.zip
cd as-docs-terraform-etapa-01
source ./cloudshell-env.sh
bash ./preparar-eks.sh
TMPDIR=/var/tmp terraform init
terraform fmt -check -recursive
terraform validate
terraform test
terraform plan -out=eks.tfplan
```

O teste simulado deve aprovar seis execuções: três verificações da rede e três
do EKS. O teste positivo EKS usa `command = apply` com provider inteiramente
simulado para comparar os IDs gerados; não cria recursos reais nem prova as
permissões de criação. O plano
real consulta a AWS; não o aplique se houver substituição/exclusão da rede ou
destino diferente do backend existente. Preserve os arquivos e analise qualquer
nova negativa de acesso do laboratório.

O cluster, os três nós, os dois NATs e os demais serviços consomem créditos do
laboratório enquanto provisionados. O encerramento do terminal não equivale à
remoção desses recursos. O tamanho inicial e o desenho com NAT por zona devem
ser considerados no saldo disponível do Learner Lab.

## 2. Aplicar depois de conferir o plano

```bash
terraform apply eks.tfplan
terraform output
```

Não reaplique o plano antigo `rede.tfplan`. O novo plano se baseia no state
remoto já migrado. EKS e node group são operações que podem levar vários minutos;
se houver erro ou interrupção, preserve o state e analise o status antes de
planejar novamente. Não apague o state nem tente criar outra rede.

## 3. Conferir o resultado real

```bash
aws eks describe-cluster --name as-docs-eks --region us-east-1 \
  --query 'cluster.{Nome:name,Status:status,Versao:version}' --output table --no-cli-pager
aws eks describe-nodegroup --cluster-name as-docs-eks --nodegroup-name as-docs-private \
  --region us-east-1 --query 'nodegroup.{Status:status,Escala:scalingConfig}' \
  --output json --no-cli-pager
aws eks list-addons --cluster-name as-docs-eks --region us-east-1 --no-cli-pager
terraform plan
```

Espere cluster e node group `ACTIVE`, três nós desejados e um plano sem
diferenças. Para a conferência Kubernetes, use um `kubectl` compatível com 1.37:

```bash
aws eks update-kubeconfig --name as-docs-eks --region us-east-1
kubectl get nodes -o wide
kubectl -n kube-system get pods -o wide
```

Confirme três nós `Ready`, endereços externos ausentes e componentes de rede/DNS
em funcionamento. Essa verificação ainda não comprova a aplicação funcional.

## Pendências da aplicação

- CSI para persistência e integração do balanceador interno ainda não estão
  instalados. A role dos nós confirmada não tem política EBS CSI nem de Load
  Balancer Controller. As políticas extras `AmazonEKSBlockStoragePolicy` e
  `AmazonEKSLoadBalancingPolicy` na role do cluster não tornam esses add-ons
  automaticamente autorizados em nós gerenciados comuns. O Auto Mode não está
  habilitado nesta entrega. A integração seguinte deve respeitar as funções e
  permissões disponíveis no laboratório.
- Os manifests existentes pedem a StorageClass `gp3` e um controlador de NLB.
  Não aplicar esses workloads antes de concluir as dependências correspondentes.
- RDS PostgreSQL 18, Redis 8/persistência, backend, IA, Keycloak, EC2 frontend,
  ALB/WAF e CI/CD entram nas próximas etapas de integração.
- Não existe dedicação de um nó por serviço. O Kubernetes distribui os pods,
  respeitando recursos e regras dos manifests.
- NAT por zona melhora a independência da saída de rede, mas não é um plano de
  recuperação de dados. Backups e testes de restauração continuam necessários.

## Referências

- [Nós e funções IAM](https://docs.aws.amazon.com/eks/latest/userguide/create-node-role.html).
- [Node groups gerenciados](https://docs.aws.amazon.com/eks/latest/userguide/managed-node-groups.html).
- [Launch templates](https://docs.aws.amazon.com/eks/latest/userguide/launch-templates.html).
- [Políticas de rede](https://docs.aws.amazon.com/eks/latest/userguide/cni-network-policy-configure.html).
- [NAT por zona](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html).
- [Recurso Terraform EKS](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/eks_cluster).
