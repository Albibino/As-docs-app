# Pré-requisitos EKS consultados no Academy

Resultado fornecido pelo usuário em 22/11/2026, horário local do Brasil.
Conta `967931808920`, região `us-east-1`. Um plano da rede no backend S3 retornou
`No changes` antes das consultas IAM/EKS.

## Função do cluster

`c224838a5679056l18095764t1w967931-LabEksClusterRole-QxlrzRzS2pNv`

Confiança no principal de serviço `eks.amazonaws.com`, ações `sts:AssumeRole`
e `sts:TagSession`. Políticas gerenciadas anexadas:

- AmazonEKSClusterPolicy
- AmazonEKSNetworkingPolicy
- AmazonEKSComputePolicy
- AmazonEKSBlockStoragePolicy
- AmazonEKSLoadBalancingPolicy

A consulta de políticas inline retornou lista vazia.

## Função dos nós

`c224838a5679056l18095764t1w967931808-LabEksNodeRole-YrMVa34iJda6`

Confiança no principal de serviço `ec2.amazonaws.com`, ação `sts:AssumeRole`.
Políticas gerenciadas anexadas:

- AmazonEKS_CNI_Policy
- AmazonEC2ContainerRegistryReadOnly
- AmazonEKSWorkerNodePolicy

A consulta de políticas inline retornou lista vazia. Essa role atende o núcleo
MNG/CNI/ECR; não foi identificada política de EBS CSI ou Load Balancer Controller.

## Versão disponível

`aws eks describe-cluster-versions --region us-east-1 --default-only` retornou:

| Versão | Suporte |
|---|---|
| 1.37 | STANDARD_SUPPORT |

Essas consultas confirmam os pré-requisitos básicos. Elas não provam permissão
para cada operação futura de criação de cluster, nós, NAT, logs ou add-ons.
O próximo plano esperado contém 13 adições; a aplicação ainda não foi executada.
