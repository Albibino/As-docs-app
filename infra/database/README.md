# Etapa 04A — RDS PostgreSQL 18 privado

Aplicado na mesma conta do Academy, regiao us-east-1 e VPC existente.
**Validate passou, cinco recursos foram criados e o plano posterior retornou
No changes.** Esta etapa cria
cinco recursos: grupo de seguranca, regra de entrada, DB subnet group,
parameter group e uma instancia RDS Multi-AZ. A instancia tem um primario e um
standby em outra zona; o standby nao e um segundo endpoint de aplicacao.

Resultado real: PostgreSQL 18.6, db.t3.micro, Multi-AZ. Endpoint e orientacoes
em [ENTREGA_AO_MUCI.md](ENTREGA_AO_MUCI.md). Evidencia em
[evidencias/2026-11-22-aplicacao-banco.md](evidencias/2026-11-22-aplicacao-banco.md).

## Isolamento e continuidade

Este diretorio corresponde a `infra/database` no GitHub e usa a chave S3
`as-docs/database.tfstate`. Le os outputs de `as-docs/terraform.tfstate`, sem
alterar a propriedade dos 35 recursos existentes. O provider restringe a conta.
Nao copie estes `.tf` para dentro de `infra/terraform` ou da pasta da etapa 01.

O banco fica nas duas sub-redes privadas. A porta 5432 aceita conexoes apenas do
SG associado aos nos EKS. TLS e obrigatorio. Armazenamento gp2 criptografado de
20 GiB, com crescimento automatico limitado a 100 GiB, atende as restricoes do
laboratorio. Enhanced Monitoring fica desabilitado.

## Executar no CloudShell

Envie `As_docs_Terraform_Etapa_04_Banco.zip` por Acoes > Fazer upload do arquivo.

```bash
cd "$HOME"
unzip -o As_docs_Terraform_Etapa_04_Banco.zip
cd as-docs-terraform-etapa-04-banco
source ./cloudshell-env.sh
python3 ./preparar-banco.py
terraform init
terraform fmt -check
terraform validate
terraform plan -out=banco.tfplan
```

O helper faz somente consultas AWS e escreve dois arquivos locais ignorados.
Confere a conta, seleciona uma versao exata PostgreSQL 18 e uma classe micro,
small ou medium disponivel com Multi-AZ, criptografia, armazenamento e zonas
necessarias. Usa a primeira classe elegivel na ordem micro, small, medium.
Interrompe se a combinacao nao estiver disponivel. Nenhuma versao e inventada.

Se qualquer comando falhar, pare nesse ponto e compartilhe o erro. O plano
esperado e de **5 adicoes, 0 alteracoes, 0 exclusoes** neste state novo.
Depois de conferir o plano, aplique:

```bash
terraform apply banco.tfplan
terraform output
terraform plan
```

A criacao RDS pode levar varios minutos. O resultado desejado e banco criado,
outputs preenchidos e novo plano sem diferencas. A conexao SQL precisa ser
testada a partir da rede privada durante a integracao com o deploy.

## Senha e entrega para o Muci

O helper gera 64 caracteres aleatorios hexadecimais em
`database-secrets.auto.tfvars.json`, com permissao 600. Reexecucoes preservam a
senha; o helper recusa gerar outra se identificar um banco existente sem o
arquivo de credencial local. Preserve esse arquivo fora do Git. Nao cole seu
conteudo no chat ou na descricao do PR.

A variavel e efemera e sensivel; o recurso usa `password_wo`, de somente escrita,
e `password_wo_version`. A senha nao e persistida no plano nem no state por esse
argumento. A aplicacao da versao salva do plano tambem precisa do arquivo local.
Uma rotacao requer trocar a senha local e incrementar `db_password_revision`.

Nas retomadas normais, carregue o ambiente, execute init e plan preservando os
dois arquivos locais. O helper e para a preparacao inicial; roda-lo novamente
consulta as versoes disponiveis e pode escolher uma versao menor mais recente.

Os outputs mostram host, porta, nome do banco, usuario e sslmode, sem a senha.
O Muci deve configurar o Secret do backend usando entrega privada da credencial.
O formato esperado e PostgreSQL na porta 5432, banco `asdocs`, com TLS; o exemplo
do repositorio ja usa `sslmode=require`. Antes do deploy, confiram se a biblioteca
cliente valida o certificado RDS corretamente. O Terraform nao executa migracoes
SQL, nao cria usuarios internos do app/Keycloak e nao implanta seus containers.

## Disponibilidade e recuperacao

Multi-AZ melhora disponibilidade; nao substitui backup. O RDS tem backups
automaticos com retencao de 7 dias. A janela de backup e 06:00-07:00 UTC e a de
manutencao domingo 07:30-08:30 UTC. Um exercicio de restauracao e a medicao de
RPO/RTO continuam pendentes; nao foi demonstrado DR completo.

O codigo protege contra exclusao acidental com `prevent_destroy` e protecao RDS.
Na limpeza planejada do laboratorio, essas protecoes precisam ser removidas
deliberadamente e o snapshot final preservado. O nome do snapshot final deve
estar livre. RDS Multi-AZ mantem um standby e consome mais creditos que Single-AZ;
o desenho usa as duas zonas ja previstas. Verifique o saldo do Academy.

## Verificacao concluida

Formatação Terraform, sintaxe Bash/Python e exercicios do helper com respostas
simuladas foram conferidos antes do empacotamento. O usuario concluiu init,
fmt, validate e plano no CloudShell. O apply criou cinco recursos sem alterar
ou excluir os anteriores; um novo plano retornou No changes. A conexao SQL e
o teste de restauracao continuam pendentes. Nenhum banco foi criado localmente.

Redis 8 continua nos manifests como StatefulSet EKS. Seus volumes gp3 e os do
backend ainda dependem da integracao CSI. A consulta do usuario nao encontrou
roles com EBS/CSI no nome e a LabRole nao confia diretamente em identidades de
pods. Nao foram alteradas confiancas IAM ou politicas do laboratorio.

Referencias:
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance
- https://docs.aws.amazon.com/cli/latest/reference/rds/describe-orderable-db-instance-options.html
- https://developer.hashicorp.com/terraform/language/manage-sensitive-data/write-only
