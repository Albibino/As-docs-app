# Proposta KMS retirada — nao aplicar

A proposta de chave propria e substituicao dos nos NAO foi aplicada.
Tres novos nos retornaram Ready na configuracao existente. O Auto Scaling
registrou tres lancamentos Successful em 23/11/2026 10:37Z (07:37 Brasilia).
A atualizacao aplicada alterou somente o IP /32 permitido na API do EKS.
O novo teste real confirmou escrita, leitura apos recriar workload e bloqueio
IMDS em regime estavel, com limpeza dos objetos temporarios.

O ultimo status administrativo consultado ainda era DEGRADED com falha anterior;
nao se confirmou que esse alerta foi removido. A causa exata da falha e da
recuperacao nao foi estabelecida. Preservar a criptografia e a configuracao
aplicada. Nao usar uma versao antiga de As_docs_Terraform_Correcao_KMS.zip.

Ver infra/terraform/evidencias/2026-11-23-retomada-lab.md e a etapa 06 aplicada.
