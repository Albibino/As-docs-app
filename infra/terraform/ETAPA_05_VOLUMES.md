# Etapa 05 — EBS gp3 aplicado e verificado

**Concluida em 23/11/2026.** A interrupcao do CloudShell foi recuperada com
backup, liberacao do bloqueio proprio e import do CSI existente. O apply de
retomada concluiu 0 adicoes, 2 alteracoes e 1 exclusao (grupo antigo). O teste
real passou e o plano final retornou No changes. O RDS esta aplicado
e convergente. Esta etapa usa o state original da rede/EKS e preserva VPC,
sub-redes, NATs e cluster. Nao altera o state do banco.

## Motivo e impacto

A node role original nao tem permissoes EBS. A simulacao da sessao retornou
implicitDeny para iam:AttachRolePolicy. A LabRole ja fornecida pelo Academy
tem confianca EC2, WorkerNode e ECR ReadOnly, e permitiu as operacoes EC2
consultadas: volumes, tags e interfaces. A simulacao nao garante todas as
condicoes/SCPs de uma execucao real. Nenhuma politica ou confianca IAM sera editada.

A role de um node group e imutavel. O plano substitui as tres maquinas do grupo
as-docs-private por um novo grupo as-docs-private-storage, tambem com tres nos.
create_before_destroy cria os substitutos antes de retirar os antigos. Durante
a transicao podem existir seis nos; o tamanho final continua tres. O usuario
consultou workloads e PVCs: havia somente CoreDNS, sem aplicacao/dados implantados.
O helper repete a verificacao e interrompe se encontrar apps/PVCs.

O CSI compativel informado pela API e v1.68.1-eksbuild.1. O schema permite
hostNetwork apenas nos pods de node, nao no controller. Como o Academy nao
disponibilizou identidade de pod autorizada, o controller usa a role do EC2 via
IMDSv2. Isso requer hop limit 2 nos novos nos, em vez do anterior 1.

**Limitacao de seguranca do laboratorio:** LabRole possui permissoes amplas e
hop limit 2 permite que pods comuns alcancem IMDS. Antes da troca dos nos,
aplique a NetworkPolicy do namespace as-docs, que exclui 169.254.169.254 do egress.
Policies sao aditivas: outra regra allow-all pode reabrir esse caminho. Isso nao
equivale ao isolamento IAM por workload de IRSA/Pod Identity; fora do Academy,
use identidade dedicada ao driver e preserve hop limit 1 para as aplicacoes.
Nao implante workloads privilegiados/hostNetwork de aplicacao para evitar o
isolamento de rede. O teste de bloqueio do IMDS ainda precisa ser executado.

## Roteiro inicial de preparacao e plano (historico)

A migracao abaixo ja foi concluida. Em retomadas normais, carregue o ambiente,
inicialize e gere um plano novo; espere No changes, salvo atualizacao necessaria
do IP de acesso. Preserve os states e os arquivos locais. Os comandos abaixo
registram o roteiro usado na migracao inicial; nao reutilize planos salvos
antes da interrupcao ou antes de qualquer mudanca de state.

O ZIP atualiza a pasta as-docs-terraform-etapa-01 sem conter state, planos,
providers ou IP local. O estado pretendido eks_storage_enabled=true esta no
terraform.tfvars versionado, para os operadores planejarem o mesmo desenho.
Preserve seus arquivos locais de acesso.

```bash
cd "$HOME"
unzip -o As_docs_Terraform_Etapa_05_Volumes.zip
cd as-docs-terraform-etapa-01
source ./cloudshell-env.sh
python3 ./preparar-volumes.py
terraform init
terraform fmt -check -recursive
terraform validate
terraform plan -out=volumes.tfplan
```

Esperado: 2 adicoes, 1 alteracao, 1 exclusao: substituicao do node group,
novo add-on e nova versao do launch template. Compare o plano real antes de
aplicar: rede, cluster e banco nao devem ser substituidos. O plano esperado e
o resultado real recebido do Academy. Evidencia em
evidencias/2026-11-22-plano-volumes.md.

## Depois de conferir o plano real

Antes de aplicar, instalar namespace, egress de protecao e StorageClass:

```bash
kubectl apply -f storage-gp3.yaml
terraform apply volumes.tfplan
kubectl get nodes -o wide
kubectl -n kube-system get pods
kubectl get storageclass gp3
terraform plan
```

Resultado desejado: tres nos Ready, CSI ativo e plano No changes. A StorageClass
usa EBS gp3 criptografado e WaitForFirstConsumer para selecionar a AZ do pod.
ReclaimPolicy Retain preserva o volume apos excluir o PVC; a limpeza de volumes
retidos exige cuidado com os dados e e uma operacao separada.

Aplicar a StorageClass nao cria ainda volumes do Redis/backend. O deploy do Muci
criara os PVCs de 5 GiB e 10 GiB ja presentes nos manifests. A prova de escrita,
leitura apos recriar um pod e bloqueio de IMDS continuam pendentes. Nao declarar
persistencia validada so porque os pods do driver estao Running.

## Teste real apos o apply

Execute `python3 ./verificar-volumes.py`. O helper confere conta, contexto,
tres nos Ready sem IP publico, driver e StorageClass. Cria uma classe temporaria
com os mesmos parametros gp3 criptografados, mas reclaimPolicy Delete, e um
volume de 1 GiB para a prova. Nao usa os volumes do app. Dois Jobs sequenciais
escrevem/fsync e leem o marcador no mesmo PVC, removendo o primeiro workload
antes do segundo. O writer testa tambem se o endpoint IMDS esta inacessivel.
Nenhum token ou credencial e exibido.

O teste usa Jobs com ownerReferences, conforme as consideracoes de NetworkPolicy
do VPC CNI. No modo standard existe uma janela inicial de allow enquanto a policy
e programada. O teste espera e confere o bloqueio em regime estavel; nao prova
ausencia dessa janela nem substitui IAM por workload. Essa limitacao precisa
constar na apresentacao da solucao do Academy.

No sucesso, remove apenas seus Jobs, PVC, PV/volume e classe temporaria. Se
falhar, preserva objetos para diagnostico. A imagem publica python:3.13-slim
precisa ser baixada; ImagePullBackOff ou quota de registro interrompem o teste
sem provar falha de armazenamento. Depois rode terraform plan e registre o
resultado. O usuario executou o helper nesta conta: escrita, leitura e bloqueio IMDS
em regime estavel passaram. Os objetos temporarios foram removidos. Evidencia
em evidencias/2026-11-23-conclusao-volumes.md.

Ao versionar no Git, inclua o codigo, YAMLs, terraform.tfvars e lock file.
O preflight somente consulta a conta e o cluster. Os testes simulados anteriores
continuam verificando o perfil da etapa 03 com eks_storage_enabled=false;
nao validam esta migracao nem suas permissoes. Plano real, teste de volume e
conferencia de bloqueio IMDS sao necessarios nesta etapa.

Fontes:
- https://docs.aws.amazon.com/eks/latest/userguide/create-node-role.html
- https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html
- https://github.com/kubernetes-sigs/aws-ebs-csi-driver/blob/master/docs/install.md
- https://github.com/kubernetes-sigs/aws-ebs-csi-driver/blob/master/docs/faq.md
