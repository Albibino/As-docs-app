# Infraestrutura do As-docs

| Pasta | Estado e uso |
|---|---|
| `terraform/` | Rede, EKS e CSI aplicados: 36 recursos gerenciados na conta `967931808920`, regiao `us-east-1`. Leia `terraform/ENTREGA_AO_GRUPO.md`. |
| `database/` | Etapa 04A aplicada: PostgreSQL 18.6 privado, Multi-AZ e backups. Cinco recursos em state proprio; plano posterior No changes. |
| `state-backend/` | Bucket S3 confirmado com bloqueio público, AES256 e versionamento. State da rede migrado, com 22 recursos gerenciados e plano sem diferenças. |

A etapa 05 foi aplicada e verificada apos recuperar a interrupcao do CloudShell.
O grupo atual e as-docs-private-storage, com tres nos privados e LabRole existente.
O teste real confirmou escrita, leitura apos recriar workload e bloqueio IMDS em
regime estavel. Objetos temporarios removidos; plano final No changes. O RDS
permanece em database/: 41 recursos Terraform no total em dois states.

William confirmou três nós privados do EKS e duas EC2 públicas para frontend.
Cluster, node group com três nós desejados, NAT por zona e add-ons básicos foram
criados. A conferência confirmou três nós Ready sem IP público, pods do sistema
Running e plano posterior No changes.
Banco e base CSI estao provisionados. Balanceadores, EC2 frontend, WAF e deploy
continuam como proximas etapas. PVCs reais entram com o deploy dos manifests.

O state correspondente à rede e ao EKS está no S3 configurado em
`terraform/backend.tf`. O pacote de integração contém código e evidências.
Inicialize esse backend com uma sessão AWS autorizada para continuar a rede
existente. O state e as credenciais não são compartilhados pelo GitHub.

Compartilhe no Git os arquivos de código, documentação e lock file. Preserve fora
do Git os arquivos de state/backup, planos, providers e credenciais. As pastas
Terraform incluem regras para esses arquivos. O acesso ao GitHub não concede
acesso AWS; a execução exige uma sessão autorizada na conta do laboratório.

O diretório `state-backend/bootstrap` mantém o código da tentativa anterior para
rastreabilidade. Não reaplique seu plano Terraform nesta conta: a consulta Object
Lock foi negada pelo Academy. O helper de recuperação usa apenas as APIs S3 de
configuração necessárias e não altera políticas do laboratório.
