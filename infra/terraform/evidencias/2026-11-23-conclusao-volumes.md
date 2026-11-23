# Etapa 05 concluida — recuperacao e prova real

Resultado recebido do usuario em 23/11/2026, conta 967931808920, us-east-1.
O state original da rede/EKS permanece em as-docs/terraform.tfstate no bucket
as-docs-tfstate-967931808920-us-east-1. O RDS fica em outro state.

## Interrupcao e recuperacao

O CloudShell encerrou durante o primeiro apply de volumes.tfplan. Nas consultas
seguintes nao havia processo Terraform no ambiente retomado. Os grupos antigo
e novo estavam ACTIVE; o CSI estava CREATING. O state ja apontava para
as-docs-private-storage, LabRole e launch template versao 2, mas nao continha
aws_eks_addon.ebs_csi[0]. O grupo antigo ficou como objeto deposed.

Foi feito backup local privado com terraform state pull e validacao JSON.
O bloqueio da propria execucao interrompida foi liberado pelo ID retornado no
arquivo de lock. O recurso CSI existente foi importado usando o ID
as-docs-eks:aws-ebs-csi-driver, sem recria-lo. O IP atual do CloudShell foi
atualizado nas variaveis locais e um novo plano foi gerado.

O plano de retomada previu 0 adicoes, 2 alteracoes e 1 exclusao: opcoes do CSI,
IP da API e retirada do grupo antigo deposed. A aplicacao terminou com:

```text
Apply complete! Resources: 0 added, 2 changed, 1 destroyed.
```

Grupo final as-docs-private-storage, minimo/desejado/maximo 3, role existente
arn:aws:iam::967931808920:role/LabRole. A versao do CSI e v1.68.1-eksbuild.1.
VPC, sub-redes, NAT, cluster e RDS foram preservados.

## Objetos Kubernetes e teste

```text
namespace/as-docs unchanged
networkpolicy.networking.k8s.io/workload-egress-without-imds unchanged
storageclass.storage.k8s.io/gp3 unchanged
```

O helper As_docs_Verificar_Volumes.py conferiu exatamente tres nos Ready sem
ExternalIP e os rollouts de controller e node do CSI. Copiou os parametros da
StorageClass gp3 real para uma classe temporaria com reclaimPolicy Delete.
Criou um PVC temporario de 1 GiB, executou dois Jobs sequenciais e removeu o
primeiro antes de criar o segundo. Saidas relevantes enviadas pelo usuario:

```text
deployment "ebs-csi-controller" successfully rolled out
daemon set "ebs-csi-node" successfully rolled out
ESCRITA_OK
IMDS_BLOQUEADO_EM_REGIME_ESTAVEL
Writer removido. Criando outro workload para ler o mesmo volume.
PERSISTENCIA_OK_APOS_RECRIAR_WORKLOAD
SUCESSO: escrita, leitura apos recriar workload e bloqueio IMDS em regime estavel.
Objetos temporarios removidos. Confira terraform plan para encerrar.
```

O teste esperou a remocao do PV temporario antes de excluir sua StorageClass.
A classe gp3 da aplicacao permanece com reclaimPolicy Retain. Nao foram criados
nem excluidos volumes de dados da aplicacao. Os PVCs reais de Redis/backend
ficam para o deploy dos respectivos manifests.

## Convergencia final

O usuario executou terraform plan -parallelism=1 apos a limpeza do teste. A
consulta incluiu o novo grupo, CSI, tres add-ons basicos e a rede e terminou com:

```text
No changes. Your infrastructure matches the configuration.
Terraform has compared your real infrastructure against your configuration and found no differences, so no changes are needed.
```

Total declarado na base: 36 recursos gerenciados. Banco: cinco em outro state,
cujo apply e plano No changes foram registrados na etapa 04A. Objetos Kubernetes
aplicados por kubectl e recursos subordinados de EKS/RDS nao sao contados como
recursos Terraform separados.

## Alcance e limites

Prova real: provisionamento e montagem EBS, escrita/fsync, leitura depois de
recriar workload, limpeza do volume temporario e bloqueio IMDS em regime estavel.
O modo standard do VPC CNI tem janela inicial de allow antes de programar a
policy. Esse teste nao elimina essa janela, nao equivale a IAM por workload e
nao valida desempenho/carga ou restauracao de snapshot.

LabRole/hop limit 2 sao uma adaptacao as funcoes existentes do Academy. A
limitacao e a necessidade de preservar as exclusoes de IMDS em outras policies
de egress continuam documentadas. Fora do laboratorio, usar identidade dedicada
ao driver e isolamento de credenciais por workload.

Ainda pendentes do projeto: EC2 frontend, balanceadores/WAF, deploy dos servicos,
conexao SQL da aplicacao e testes de restauracao/DR. A etapa 05 foi encerrada.
