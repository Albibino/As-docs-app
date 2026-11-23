# Banco provisionado — dados para o deploy

| Campo | Valor confirmado |
|---|---|
| Conta / regiao | 967931808920 / us-east-1 |
| Instancia | as-docs-postgres |
| Engine / classe | PostgreSQL 18.6 / db.t3.micro |
| Endpoint | as-docs-postgres.calk1qmjb2wt.us-east-1.rds.amazonaws.com |
| Porta | 5432 |
| Database | asdocs |
| Usuario inicial | asdocs_admin |
| TLS | sslmode=require; rds.force_ssl=1 |
| Disponibilidade | Multi-AZ |
| SG | sg-007d7ec3ede49abba |
| Acesso de rede | SG dos nos EKS sg-0a3d3f64bea7b6b6e |
| Backups | Retencao automatica de 7 dias |
| State | S3 as-docs/database.tfstate no bucket de state existente |

O apply criou cinco recursos e o plano posterior retornou No changes.
A rede/EKS continua no outro state, com 36 recursos apos acrescentar o CSI. A borda tem outros 20 em edge.tfstate.

O Secret do backend deve receber DATABASE_URL no formato documentado pelo app:

```text
postgresql://asdocs_admin:<senha-entregue-em-privado>@as-docs-postgres.calk1qmjb2wt.us-east-1.rds.amazonaws.com:5432/asdocs?sslmode=require
```

A senha esta apenas no arquivo local database-secrets.auto.tfvars.json do
executor. Nao e incluida no ZIP, GitHub, PR ou outputs. Entregue-a em privado
ao responsavel pelo deploy. Preserve esse arquivo para retomar o Terraform.

Pendente com o deploy: testar conexao SQL a partir da rede privada, validar o
certificado TLS no cliente, executar migracoes e conferir os usuarios/bancos
necessarios ao Keycloak. Este provisionamento cria somente o banco asdocs.
O teste de restauracao continua pendente; Multi-AZ nao o substitui.
