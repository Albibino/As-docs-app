# Infraestrutura do As-docs

| Pasta | Estado e uso |
|---|---|
| `terraform/` | Rede aplicada: 22 recursos na conta `967931808920`, região `us-east-1`. Leia `terraform/ENTREGA_AO_GRUPO.md`. |
| `state-backend/` | Bucket S3 confirmado com bloqueio público, AES256 e versionamento, após ajuste por restrição SCP. Migração do state da rede ainda pendente; leia o README da pasta. |

William confirmou três nós privados do EKS e duas EC2 públicas para frontend.
Cluster, nós, NAT, bancos, balanceadores, WAF e deploy ainda não foram criados por
esta configuração. A rede atual pode receber essas próximas etapas.

O state correspondente aos 22 recursos está no CloudShell do responsável. O ZIP
de integração contém código e evidências. Inicializar um state vazio nessa conta
produzirá um plano de outra rede: antes de aplicar mudanças, conclua e confira a
migração para o backend S3 e use seu `backend.tf` no projeto do repositório.

Compartilhe no Git os arquivos de código, documentação e lock file. Preserve fora
do Git os arquivos de state/backup, planos, providers e credenciais. As pastas
Terraform incluem regras para esses arquivos. O acesso ao GitHub não concede
acesso AWS; a execução exige uma sessão autorizada na conta do laboratório.

O diretório `state-backend/bootstrap` mantém o código da tentativa anterior para
rastreabilidade. Não reaplique seu plano Terraform nesta conta: a consulta Object
Lock foi negada pelo Academy. O helper de recuperação usa apenas as APIs S3 de
configuração necessárias e não altera políticas do laboratório.
