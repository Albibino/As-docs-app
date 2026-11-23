# EBS no Academy — etapa 05 aplicada e verificada

O banco foi aplicado e convergiu. Para os PVCs gp3 do app, o usuario consultou
IAM: sessao voclabs retornou implicitDeny para AttachRolePolicy; LabRole retornou
allowed nas operacoes EC2 consultadas de volume, tags e interfaces, sem contexto
faltante. A LabRole ja possui WorkerNode, ECR e politicas do laboratorio.
Sua confianca inclui EC2; nao confia em identidades de pods.

A API informou CSI v1.68.1-eksbuild.1 para EKS 1.37, com hostNetwork apenas no
node. A alternativa preparada usa LabRole nos novos nos e IMDSv2 hop limit 2 para
o controller. Exige aplicar a NetworkPolicy de egress que exclui IMDS no
namespace as-docs antes da troca. Essa e uma limitacao de isolamento do Academy,
nao um modelo de IAM por workload para producao. Outras policies de egress
devem preservar a exclusao, pois permissoes NetworkPolicy sao aditivas.

O usuario listou deployments, StatefulSets e PVCs: somente CoreDNS, sem PVCs.
O preflight repete a consulta antes de permitir o plano da migracao. Os tres
substitutos sao criados antes da retirada dos antigos; o final permanece tres
nos. VPC, cluster, NAT e RDS nao devem ser substituidos.

O usuario concluiu validate e o plano real confirmou 2 adicoes, 1 alteracao
e 1 exclusao no state da base. A retomada apos a queda do CloudShell terminou com 0 adicoes, 2 alteracoes e
1 exclusao do grupo antigo. O CSI existente foi importado ao state apos backup
e liberacao do bloqueio da execucao interrompida.
O guia e `infra/terraform/ETAPA_05_VOLUMES.md`.
O teste real passou: escrita/fsync, leitura apos recriar o workload e bloqueio
IMDS em regime estavel. Objetos temporarios removidos. Plano final No changes. A nova StorageClass
gp3 usa criptografia, WaitForFirstConsumer e reclaimPolicy Retain.

O helper verificar-volumes.py prepara uma prova com dois Jobs sequenciais,
volume temporario de 1 GiB e parametros copiados da classe real. Escreve/fsync,
remove o primeiro workload e le no segundo. Tambem testa o bloqueio IMDS depois
da programacao da NetworkPolicy; isso nao comprova isolamento durante a janela
inicial de allow do VPC CNI standard nem substitui IAM por workload. A classe
temporaria usa Delete para remover somente o volume de teste apos sucesso.
Falhas preservam os objetos para diagnostico. Os payloads foram conferidos localmente e o helper depois foi executado na AWS,
com resultado SUCESSO recebido do usuario. Evidencia em
infra/terraform/evidencias/2026-11-23-conclusao-volumes.md.
