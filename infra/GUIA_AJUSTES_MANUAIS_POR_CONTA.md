
# As-docs — substituições manuais por conta AWS Academy

**Revisão:** 24/11/2026 (v3). **Público:** integrante que clonou os dois repositórios e deseja usar **sua própria AWS**.

> **Use junto com** [`GUIA_REPRODUCAO_AWS.md`](GUIA_REPRODUCAO_AWS.md) (comandos oficiais Terraform) e [`GUIA_DEPLOY_AWS_MULTICONTA.md`](GUIA_DEPLOY_AWS_MULTICONTA.md) (deploy, HTTPS e testes). Este arquivo é o **manual de substituições**, não um instalador. A referência é a auditoria real de 24/11/2026 na conta principal, cujas correções de código precisam ser publicadas em commits revisados. **Não modificar a conta principal apenas para preparar a cópia de outros integrantes.**

## Índice

1. [Preparação e regra geral](#1-preparação-e-regra-geral)
2. [Conta AWS: substituição recorrente](#2-conta-aws-substituição-recorrente)
3. [Bucket e roles](#3-bucket-e-roles)
4. [VPC: trocar somente após criar a rede](#4-vpc-trocar-somente-após-criar-a-rede)
5. [ECR, aplicação e IA](#5-ecr-aplicação-e-ia)
6. [DNS e ACM](#6-dns-e-acm)
7. [Segredos e arquivos que não se copiam](#7-segredos-e-arquivos-que-não-se-copiam)
8. [Matriz por arquivo e revisão final](#8-matriz-por-arquivo-e-revisão-final)

## 1. Preparação e regra geral

**Abra o PowerShell na raiz local do `As-docs-app`**. O disco e o nome da pasta não importam:

```powershell
$APP_ROOT = (Get-Location).Path
$env:AWS_PROFILE = 'estudante'
$CONTA_DESTINO = (aws sts get-caller-identity --profile estudante --query Account --output text).Trim()
if ($LASTEXITCODE -ne 0 -or $CONTA_DESTINO -notmatch '^\d{12}$') { throw 'Verifique credenciais e conta AWS.' }
Write-Host "Conta destino: $CONTA_DESTINO"
```

Antes de editar: trabalhar em **cópia/clonagem do projeto para a conta destino**, conferir `git status`, salvar backups e escolher os commits consensuais do grupo. Não editar arquivos `.tfstate`, `.terraform/` nem os diretórios históricos `infra/state-backend/bootstrap`/`migracao`. Os trechos abaixo são **padrões a localizar**, não números de linha fixos. Os placeholders entre `<...>` significam "insira o seu valor real".

**Regra fundamental:** os identificadores **não são senhas**, mas a combinação errada pode apontar Terraform para recursos de outro integrante. Portanto, substituir nos **arquivos-fonte ativos**, não indiscriminadamente em todo o disco. Depois auditar e ler `terraform plan`.

## 2. Conta AWS: substituição recorrente

**Valor da conta principal que NÃO deve ser copiado para outra conta:**

```text
362749056012
```

**Como descobrir o seu:**

```powershell
aws sts get-caller-identity --profile estudante --query Account --output text
```

**O que fazer:** nos arquivos-fonte ativos da tabela da seção 8, adaptar **todas as ocorrências relevantes** de `362749056012` para seu ID de 12 dígitos. Para localizar:

```powershell
Set-Location $APP_ROOT
git grep -n '362749056012' -- infra deploy scripts
```

Esse comando **localiza**, não altera. Use-o novamente depois de corrigir e verifique se as ocorrências remanescentes são históricas, exemplos ou realmente estão em arquivos executados. `git grep` não cobre automaticamente todos os arquivos ignorados/não rastreados: conferir `tls.auto.tfvars`, arquivos locais e o segundo repositório separadamente.

**Exemplo ilustrativo** — suponha que o comando STS do novo integrante devolva `123456789012` (CONTA FICTÍCIA):

```hcl
# ANTES, conta principal:
expected_account_id = "362749056012"
# DEPOIS, conta fictícia de exemplo:
expected_account_id = "123456789012"
```

Em ARNs e ECR, a parte numérica também muda **desde que o recurso exista na conta destino**:

```text
# ANTES
arn:aws:iam::362749056012:role/LabRole
362749056012.dkr.ecr.us-east-1.amazonaws.com/as-docs-backend:latest
# DEPOIS (exemplo fictício)
arn:aws:iam::123456789012:role/LabRole
123456789012.dkr.ecr.us-east-1.amazonaws.com/as-docs-backend:latest
```

**Exceções:** nas roles EKS, não basta trocar só o ID; o nome inteiro da role pode ter prefixos e sufixos diferentes. Em S3, o nome do bucket pode não ser o padrão. Em ACM, o UUID do certificado é sempre próprio. **Nunca copiar ARN inteiro de outra conta presumindo que ficará válido.**

## 3. Bucket e roles

### Bucket S3 de state

**Principal:** `as-docs-tfstate-362749056012-us-east-1`. **Destino:** criar bucket privado, criptografado, versionado e de nome disponível **na conta destino**, conforme o procedimento único da seção 3 de `GUIA_REPRODUCAO_AWS.md`.

O padrão é `as-docs-tfstate-<CONTA_DESTINO>-us-east-1`, mas o bucket deve ter o nome **efetivamente criado**: se o nome já existir globalmente, escolha outro e atualize todas as referências ativas.

Procurar o trecho `bucket = "as-docs-tfstate-362749056012-us-east-1"` em:

- `infra/terraform/backend.tf`
- `infra/database/versions.tf` e `infra/database/providers.tf`
- `infra/edge/versions.tf` e `infra/edge/providers.tf`

Trocar também `allowed_account_ids = ["362749056012"]` nos mesmos módulos, quando presente. **Preservar chaves do state:** `as-docs/terraform.tfstate`, `as-docs/database.tfstate` e `as-docs/edge.tfstate`, que são distintas **dentro do bucket da sua conta**.

### Roles IAM EKS e LabRole

```powershell
aws iam list-roles --profile estudante --query "Roles[?contains(RoleName, 'LabEks')].[RoleName,Arn]" --output table
aws iam get-role --role-name LabRole --profile estudante --query Role.Arn --output text
aws iam get-instance-profile --instance-profile-name LabInstanceProfile --profile estudante --query 'InstanceProfile.Roles[].Arn' --output text
```

Copiar os **ARNs reais e completos** das duas roles EKS para `eks_cluster_role_arn` e `eks_node_role_arn` de `infra/terraform/terraform.tfvars`. Não procurar/substituir apenas os 12 dígitos dentro dessas duas linhas: o restante do ARN também varia. Ajustar a comparação exata com `role/LabRole` em `infra/edge/frontend.tf` e `infra/edge/preparar-borda.py`. Se o laboratório não tiver as roles, interromper a reprodução e verificar permissões.

## 4. VPC: trocar somente após criar a rede

**VPC da conta principal:** `vpc-0a79932ef5165619e`. **Não use este ID no banco/borda de outra conta.** Ele só pode ser substituído **depois** de `infra/terraform` criar a rede destino.

```powershell
Set-Location (Join-Path $APP_ROOT 'infra\terraform')
terraform output -raw vpc_id
```

Anotar o ID retornado como `<VPC_DESTINO>`; conferir que ele existe na conta correta. Depois atualizar as **comparações fixas** nos arquivos ativos:

- `infra/database/main.tf` — trecho `data.terraform_remote_state.network.outputs.vpc_id == "vpc-0a79932ef5165619e"`;
- `infra/edge/frontend.tf` — trecho `local.base.vpc_id == "vpc-0a79932ef5165619e"`;
- `infra/edge/preparar-borda.py` e `infra/edge/verificar-borda.py` — guardas de VPC e conta;
- `infra/edge/tests/edge.tftest.hcl` — caso testes ainda verifiquem o ID antigo.

Manter as **referências dinâmicas** ao state (`data.terraform_remote_state.network.outputs.vpc_id`) e o requisito das duas sub-redes. Não substituir VPC por texto vazio, nem remover as preconditions para "facilitar" o apply.

## 5. ECR, aplicação e IA

Depois de criar os repositórios ECR e publicar imagens **na sua conta**, adaptar os manifestos abaixo.

| Repositório | Arquivo | Procurar | Alterar para |
|---|---|---|---|
| As-docs-app | `deploy/k8s/22-backend.yaml` | `image: 362749056012.dkr.ecr.us-east-1.amazonaws.com/as-docs-backend:latest` | `image: <CONTA_DESTINO>.dkr.ecr.us-east-1.amazonaws.com/as-docs-backend:latest` |
| As-docs-app | `deploy/k8s/20-backend-config.yaml` | `APP_URL: "https://www.asdocs.abrdns.com"` | `APP_URL: "https://<HOSTNAME_DESTINO>"` |
| As-docs-ai | `deploy/k8s/20-ai.yaml` | `image: 362749056012.dkr.ecr.us-east-1.amazonaws.com/as-docs-ai:latest` | `image: <CONTA_DESTINO>.dkr.ecr.us-east-1.amazonaws.com/as-docs-ai:latest` |
| As-docs-ai | `deploy/k8s/10-ai-config.yaml` | `AI_EMBEDDING_PROVIDER`, `AI_CHAT_PROVIDER` | Manter `hashing` e `extractive` para reproduzir o **modo validado**, sem OpenAI API |

**Atenção:** `<...>` na coluna é um placeholder ilustrativo — substitua por ID real antes de aplicar Kubernetes. Não altere Service `NodePort` 30300 para `LoadBalancer`: o NLB é criado pelo Terraform. Não restaure Nginx antigo: manter `map $http_x_forwarded_proto $fwd_proto { default $http_x_forwarded_proto; '' $scheme; }`. Não copiar nome do NLB entre contas: `BACKEND_URL` nas duas EC2 aponta ao **NLB da própria conta**.

**Secret do backend:** criar `APP_SECRET`, `DATABASE_URL` do **RDS próprio**, e `DOCS_AI_HMAC_SECRET` próprio. **Secret da IA:** mesmo valor de HMAC **dessa conta**; nunca de outra. Confira os modelos `deploy/k8s/21-backend-secret.example.yaml` e `As-docs-ai/deploy/k8s/11-ai-secret.example.yaml` e não aplique modelos com valores fictícios.

## 6. DNS e ACM

**Endereço principal em uso:** `www.asdocs.abrdns.com`. Cada integrante deve escolher um **hostname exclusivo** disponível, preferencialmente sob sua própria zona DNS autorizada. Não precisa usar a letra do nome; `www` em outra zona é válido. Não anunciar URL de reserva antes de estar validada.

**Obtenção:** DNS do ALB de destino vem de `terraform output` de `infra/edge`. Em sua zona ClouDNS criar CNAME do host da aplicação → DNS do **ALB destino**. No ACM da **sua conta**, pedir certificado em `us-east-1` para **aquele hostname**; copiar exatamente o CNAME de **validação** fornecido pelo ACM, que é diferente do CNAME da aplicação; esperar `ISSUED`.

Localizar `infra/edge/variables.tf`: a expressão que valida `arn:aws:acm:us-east-1:362749056012:certificate/...` deve usar `<CONTA_DESTINO>` (substituir os dígitos na regex), mas o ARN **real** do certificado será aquele gerado na sua conta.

Criar localmente `infra/edge/tls.auto.tfvars` (verificar `.gitignore`), com valores **reais**, no seguinte formato:

```hcl
# SUBSTITUIR OS DOIS VALORES PELOS DA SUA CONTA ANTES DE terraform plan:
public_hostname     = "SEU_HOSTNAME_DNS_EXCLUSIVO"
acm_certificate_arn = "ARN_REAL_DO_SEU_CERTIFICADO_ACM"
```

Após `ISSUED`, aplicar TLS pela borda. Ajustar no backend `APP_URL=https://<HOSTNAME_DESTINO>` e nas **duas** EC2 `PUBLIC_APP_URL=https://<HOSTNAME_DESTINO>`; recriar containers depois de editar `.env` (um `docker restart` não basta). O NLB interno continua HTTP e não usa a URL pública como `BACKEND_URL`.

## 7. Segredos e arquivos que não se copiam

**Não fazer busca/substituição automática em senhas.** Para uma nova conta, gerar credenciais próprias e gravá-las apenas nos mecanismos privados que esperam seus valores.

Nunca copiar/commitar: `%USERPROFILE%\.aws\credentials`, `AWS_SESSION_TOKEN`, `.env` real, HMAC, `DATABASE_URL` preenchida com senha, `database-secrets.auto.tfvars.json`, backups e snapshots, `terraform.tfstate`/`.terraform`, cookies de sessão, chaves privadas. O `terraform.tfvars` da rede **já era rastreado** no Git da conta principal; revisar antes do commit. `.gitignore` sozinho não remove arquivo rastreado.

**IDs, ARNs e hostnames são identificadores, não segredos em si**, mas devem ser trocados porque apontam para recursos específicos da conta original.

## 8. Matriz por arquivo e revisão final

As âncoras abaixo são nomes e trechos procuráveis — **não dependem de números de linha**.

| Ordem | Arquivo ativo | Âncora / ação |
|---|---|---|
| 1 | `infra/terraform/backend.tf` | `bucket`, `allowed_account_ids`: bucket/conta destino |
| 1 | `infra/terraform/terraform.tfvars` | `expected_account_id`, `eks_cluster_role_arn`, `eks_node_role_arn`: valores reais |
| 1 | `infra/terraform/preparar-eks.sh` | Verificação `AS_DOCS_ACCOUNT` com conta original → destino |
| 1 | `infra/terraform/preparar-volumes.py` | `identity["Account"]`: destino |
| 1 | `infra/terraform/verificar-volumes.py` | `account['Account']` e ARN `cluster/as-docs-eks`: destino |
| 2 | `infra/database/versions.tf` | `bucket`, `allowed_account_ids`: destino |
| 2 | `infra/database/providers.tf` | provider e `terraform_remote_state` com conta/bucket destino |
| 2 | `infra/database/main.tf` | comparação fixa `outputs.vpc_id == "vpc-..."`: VPC recém-criada |
| 2 | `infra/database/preparar-banco.py` | constante `ACCOUNT`: destino |
| 3 | `infra/edge/versions.tf` | bucket/conta destino |
| 3 | `infra/edge/providers.tf` | provider e `terraform_remote_state`: conta/bucket destino |
| 3 | `infra/edge/frontend.tf` | `local.base.vpc_id`, `role/LabRole`: VPC e role próprias |
| 3 | `infra/edge/variables.tf` | regex `arn:aws:acm:us-east-1:<CONTA>:certificate/...`: conta própria |
| 3 | `infra/edge/preparar-borda.py` | identidade, LabRole, VPC, contexto EKS da conta destino |
| 3 | `infra/edge/verificar-borda.py` | identidade e VPC destino |
| 3 | `infra/edge/tests/edge.tftest.hcl` | revisar fixtures com conta/VPC fixas |
| 4 | `deploy/k8s/22-backend.yaml` | imagem ECR da conta, Service `NodePort` 30300 |
| 4 | `deploy/k8s/20-backend-config.yaml` | `APP_URL` hostname próprio; Redis/IA internos preservados |
| 4 | `As-docs-ai/deploy/k8s/20-ai.yaml` | imagem ECR da conta; Service ClusterIP e NetworkPolicy |
| 4 | `As-docs-ai/deploy/k8s/10-ai-config.yaml` | `hashing`/`extractive` se for repetir modo comprovado |
| 5 | EC2 `/opt/as-docs/frontend.env` (não é Git) | NLB privado e hostname HTTPS próprios, recriar container |

### Verificação final antes de `terraform apply` ou commit

```powershell
Set-Location $APP_ROOT
# Pesquisa em arquivos rastreados ativos; não altera nenhum arquivo:
git grep -n '362749056012' -- infra deploy scripts
git grep -n 'vpc-0a79932ef5165619e' -- infra deploy scripts
git grep -n 'www.asdocs.abrdns.com' -- infra deploy scripts
# Outros nomes antigos do ZIP podem aparecer: 967931808920 e vpc-04354398b0920234a.
# Execute scripts/auditar-reproducao.ps1 se ele estiver presente.
git status --short
git diff --check
```

Faça a revisão também dentro do repo `As-docs-ai`. Os resultados de `git grep` podem incluir **documentação histórica, exemplos ou referências que não devem ser modificadas**, portanto verifique o contexto. As listas do script de auditoria não garantem encontrar todas as dependências. **Nunca** compartilhar credenciais nem state com a equipe.

**Critério de pronto:** Terraform de cada módulo com `validate`/`plan` sem exclusões inesperadas, conta/region confirmadas, containers e pods saudáveis, HTTPS sem ignorar certificado, `/api/health/live` HTTP 200, `tcc-e2e.py` com `E2E OK`, editor persistente após F5 e colaboração em tempo real testada naquela conta. O E2E cria/edita páginas de demonstração reais.
