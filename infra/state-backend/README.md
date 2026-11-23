# As-docs — etapa 02: state no S3

A rede da conta `967931808920`, região `us-east-1`, já tem 22 recursos criados,
com plano posterior sem diferenças. A migração S3 foi concluída e o state remoto
foi verificado com novo `init`, 22 recursos gerenciados na lista e `No changes`.
O backend ativo está em `../terraform/backend.tf`. Os procedimentos de criação
e migração abaixo ficam como referência; continue com `init` normal.

## Ajuste após o teste real no Academy

O bootstrap Terraform passou em validação, em 1 teste simulado e em um plano de
4 adições. O apply iniciou o bucket, mas falhou na consulta de Object Lock com
`s3:GetBucketObjectLockConfiguration`, explicitamente negada por uma SCP do
laboratório. A execução posterior do helper confirmou que o bucket existe na
conta esperada e concluiu bloqueio público, criptografia e versionamento.
Não reaplique `state.tfplan`; preserve os states das duas pastas.

`bootstrap/LEIA-ANTES-DE-EXECUTAR.md` registra o ocorrido. Os arquivos Terraform
antigos dessa pasta ficam como histórico e não devem ser executados nesta conta.

O procedimento atual configura o bucket existente pelas operações S3 específicas
de bloqueio público, criptografia e versionamento. Não consulta Object Lock nem
altera políticas IAM/SCP. Uma nova negativa de acesso interrompe a execução.
Object Lock, que trata de retenção de objetos, é diferente do bloqueio de state
`use_lockfile` usado pelo backend Terraform.

## 1. Atualizar o pacote e recuperar a configuração

Esta recuperação já foi concluída pelo usuário com o script avulso
`As_docs_Recuperar_State_S3.sh`. Evidência em
`evidencias/2026-11-22-configuracao-s3.md`: os quatro bloqueios públicos estão
`true`, a criptografia é `AES256` e o versionamento está `Enabled`. As instruções
abaixo permanecem como referência: a migração também já foi concluída.

Envie a versão atualizada de `As_docs_Terraform_Etapa_02_State.zip` ao CloudShell.
O comando abaixo atualiza somente o código do pacote; o ZIP não contém states nem
planos e não sobrescreve os arquivos de state existentes.

```bash
cd "$HOME"
unzip -o As_docs_Terraform_Etapa_02_State.zip
bash "$HOME/as-docs-terraform-etapa-02-state/bootstrap/recuperar-configuracao-s3.sh"
```

O helper confere a conta e a propriedade do bucket existente. Antes de alterar
configurações, preserva os states/planos locais existentes em uma pasta
`backup-local-...`, dentro de `bootstrap/`. Ele não cria nem exclui buckets, não
remove entradas do state e não toca no state da rede. Um erro no `head-bucket`
inicial exige análise antes de continuar.

Ao terminar, a saída deve mostrar quatro bloqueios públicos `true`, criptografia
`AES256` e versionamento `Enabled`. A execução ainda depende das permissões reais
do laboratório. Se houver `AccessDenied`, pare e preserve a mensagem.

Se o versionamento for habilitado pela primeira vez, a AWS recomenda aguardar
15 minutos antes de gravar objetos. O helper avisa quando o habilitou. Use esse
intervalo para organizar a inclusão do código no GitHub; não há espera bloqueante
no script nem migração automática.

## 2. Migrar o state existente da rede

Etapa já concluída nesta conta. Não repita o helper: ele é apenas para a
primeira migração. Evidência em
`../terraform/evidencias/2026-11-22-migracao-state-s3.md`.

Depois de confirmar a configuração e o intervalo de propagação do versionamento,
execute no CloudShell da mesma conta:

```bash
bash "$HOME/as-docs-terraform-etapa-02-state/migracao/migrar-state-s3.sh"
```

O state local da rede deve estar em
`$HOME/as-docs-terraform-etapa-01/terraform.tfstate`, com a VPC
`vpc-04354398b0920234a`. O helper verifica essa identidade sem imprimir o state,
confere o bucket, seu versionamento, bloqueio público e a ausência do objeto de
destino. Um erro de acesso não é tratado como objeto inexistente.

O script cria backup `terraform.tfstate.pre-s3-DATA`, copia o exemplo para
`backend.tf` na pasta da rede e usa `terraform init -migrate-state`. Se houver a
pergunta de cópia do state local para o S3, confira o destino e confirme com `yes`.
A chave é `as-docs/terraform.tfstate`, no bucket
`as-docs-tfstate-967931808920-us-east-1`. Não é usado `-force-copy`.

Se já houver state na chave S3 ou um `backend.tf`, o helper interrompe. Depois da
migração, retome com `init` normal, sem repetir o helper de migração.

## 3. Conferir a continuidade da rede

```bash
cd "$HOME/as-docs-terraform-etapa-01"
export PATH="$HOME/.local/bin:$PATH"
export TF_DATA_DIR="/var/tmp/as-docs-terraform-data-${UID}"
mkdir -p "$TF_DATA_DIR"
TMPDIR=/var/tmp terraform init
terraform state list
terraform plan
```

Confirme os 22 recursos gerenciados e `No changes`. A consulta
`data.aws_availability_zones.available` também pode aparecer no `state list`.
Se o plano indicar criação da rede novamente, preserve os arquivos e confira o
backend e a origem do state antes de aplicar qualquer alteração.

Confira os metadados do objeto, sem baixar nem divulgar o state:

```bash
aws s3api head-object \
  --bucket as-docs-tfstate-967931808920-us-east-1 \
  --key as-docs/terraform.tfstate \
  --expected-bucket-owner 967931808920 \
  --region us-east-1 \
  --query '{Tamanho:ContentLength,Criptografia:ServerSideEncryption,Versao:VersionId}'
```

## Inclusão no repositório

O código de aplicação da infraestrutura fica em `infra/terraform` do As-docs-app.
Este apoio ao state fica em `infra/state-backend`. A migração foi confirmada;
`infra/terraform/backend.tf` está incluído no pacote atualizado para o repositório.

Compartilhe código e lock file. States, backups, planos, providers e credenciais
ficam fora do Git. O acesso ao GitHub não concede acesso AWS: os executores precisam
de uma sessão autorizada e das permissões S3 do backend e do arquivo `.tflock`.
O helper não concede permissões nem modifica as restrições do Academy.

O S3 guarda o registro do Terraform. Backups e recuperação dos dados PostgreSQL e
Redis são requisitos separados do plano de DR. A permanência dos recursos também
depende do ciclo de vida do Learner Lab.

## Verificação

O procedimento original foi validado e planejado no CloudShell, mas seu apply foi
interrompido pela SCP na leitura Object Lock. O helper de recuperação passou por
conferência de sintaxe e verificações simuladas de parada por erro/conta incorreta.
A execução real do helper foi concluída pelo usuário: propriedade do bucket
conferida, bloqueio público, criptografia e versionamento confirmados. A migração
também foi concluída e verificada com os 22 recursos no state e novo plano sem
diferenças, preservando os IDs existentes.

## Referências

- [Backend S3 do Terraform](https://developer.hashicorp.com/terraform/language/backend/s3).
- [AWS: erros 403 e SCPs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/troubleshoot-403-errors.html).
- [AWS: habilitação de versionamento e propagação](https://docs.aws.amazon.com/cli/latest/reference/s3api/put-bucket-versioning.html).
- Readme do Learner Lab fornecido pelo usuário.
