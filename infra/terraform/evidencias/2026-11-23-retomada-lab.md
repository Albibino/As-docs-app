# Retomada do Learner Lab em 23/11/2026

## Confirmado pelo usuario no CloudShell

- Cluster as-docs-eks ACTIVE; RDS as-docs-postgres available e MultiAZ.
- Grupo privado inicialmente DEGRADED, novas EC2 terminadas com Client.InternalError.
- CloudTrail: kms:Decrypt/AccessDenied para identidades EC2 de infraestrutura.
- Chave aws/ebs habilitada; ListGrants retornou vazio no momento da consulta.
- Preparou-se uma alternativa com chave propria, mas ela NAO foi aplicada.
- Plano de acesso: somente troca do IP /32 para 34.230.68.151/32.
  Apply: 0 adicionados, 1 alterado, 0 destruidos. Nenhuma troca de chave ou grupo.
- Depois do acesso, tres novos nos Ready, sem ExternalIP, em duas zonas.
  Tinham cerca de seis minutos de vida; a troca do IP apenas liberou kubectl.
- Auto Scaling registrou tres lancamentos Successful em 2026-11-23T10:37:14Z
  (07:37 no horario de Brasilia), posteriores aos Cancelled de 10:05Z.
- Novo teste real As_docs_Verificar_Volumes.py passou:
  ESCRITA_OK; IMDS_BLOQUEADO_EM_REGIME_ESTAVEL;
  PERSISTENCIA_OK_APOS_RECRIAR_WORKLOAD; objetos temporarios removidos.
- LabInstanceProfile existe e contem arn:aws:iam::967931808920:role/LabRole.

## Limites

A ultima consulta ao status do node group ainda retornava DEGRADED com o erro
anterior; o estado administrativo final nao foi reconfirmado. Os lancamentos e
workloads efetivamente testados estavam funcionais. Nao foi estabelecida a causa
exata da perda/ausencia de autorizacao KMS nem da recuperacao automatica.
Nao afirmar que e necessario criar chave propria ou desativar criptografia.

A proposta de correcao KMS foi retirada e o arquivo disponibilizado foi
substituido por aviso. Codigo da etapa 05 permanece como aplicado. A excecao
IMDS/IAM e seus limites, documentados na etapa 05, continuam.
