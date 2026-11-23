# Resultado recebido do CloudShell — RDS

Conta 967931808920, regiao us-east-1, state S3 as-docs/database.tfstate.
O helper consultou a API e selecionou PostgreSQL 18.6, db.t3.micro, gp2 20 GiB,
Multi-AZ. A credencial local foi gerada sem exibicao.

Init, fmt -check e validate passaram. O plano retornou 5 adicoes, 0 alteracoes,
0 exclusoes. O usuario executou terraform apply banco.tfplan.

```text
aws_db_parameter_group.postgres: Creation complete [id=as-docs-postgres18]
aws_db_subnet_group.private: Creation complete [id=as-docs-postgres-private]
aws_security_group.database: Creation complete [id=sg-007d7ec3ede49abba]
aws_vpc_security_group_ingress_rule.eks_postgres: Creation complete [id=sgr-0ded950c20a2aa492]
aws_db_instance.postgres: Creation complete after 15m56s [id=db-XT5F5VLOPOCMYSKNTAB23C2RRQ]
Apply complete! Resources: 5 added, 0 changed, 0 destroyed.
```

Outputs recebidos:

```text
database_connection = {
  database = "asdocs"
  host = "as-docs-postgres.calk1qmjb2wt.us-east-1.rds.amazonaws.com"
  instance_id = "as-docs-postgres"
  multi_az = true
  port = 5432
  sslmode = "require"
  username = "asdocs_admin"
}
database_security_group_id = "sg-007d7ec3ede49abba"
```

Novo terraform plan consultou os cinco recursos e terminou com:

```text
No changes. Your infrastructure matches the configuration.
Terraform has compared your real infrastructure against your configuration and found no differences, so no changes are needed.
```

O registro resume as linhas relevantes recebidas; nao e um log integral.
Conexao SQL, deploy da aplicacao e restauracao de backup ainda nao foram testados.
