
# As-docs — Guia de reprodução da infraestrutura AWS Academy

**Data da validação da infraestrutura:** 23/11/2026 · **Revisão documental:** 24/11/2026 (v3)
**Contexto da validação:** reprodução técnica da infraestrutura por integrante do grupo
**Base técnica:** Terraform entregue por Vinicius Minas no repositório `As-docs-app`
**Ambiente validado:** AWS Academy Learner Lab, região `us-east-1`, AWS CLI no Windows/PowerShell

> **Este guia é SOMENTE para infraestrutura (S3, VPC/EKS, banco, borda).** Para deploy da aplicação e HTTPS usar [`GUIA_DEPLOY_AWS_MULTICONTA.md`](GUIA_DEPLOY_AWS_MULTICONTA.md); para os valores a substituir por conta, [`GUIA_AJUSTES_MANUAIS_POR_CONTA.md`](GUIA_AJUSTES_MANUAIS_POR_CONTA.md). Comandos Terraform têm **este guia como fonte de verdade**. O script de auditoria acompanha o repositório em `../scripts/auditar-reproducao.ps1`. A execução numa segunda conta em 23/11 validou **infraestrutura**, não a aplicação completa nessa segunda conta. A aplicação principal teve validação funcional própria em 24/11.
>
> **Todos os comandos PowerShell com `Set-Location` usam `$APP_ROOT`**, definido no início, em vez de letra/caminho específicos do computador.

## Índice

1. [Objetivo e escopo](#1-objetivo-e-escopo)
2. [Pré-requisitos](#2-pré-requisitos)
3. [Preparar S3](#3-preparar-o-bucket-s3-do-estado-terraform)
4. [VPC, EKS e volumes](#4-primeira-etapa--infraterraform-rede--eks)
5. [RDS](#5-segunda-etapa--infradatabase-postgresql-rds)
6. [Borda](#6-terceira-etapa--infraedge-ec2-alb-nlb-e-waf)
7. [Evidências de infraestrutura](#7-evidências-obtidas-em-23112026)
8. [Cuidados](#8-cuidados-limitações-e-entrega-ao-grupo)
9. [Referências](#9-referências-internas-do-repositório)

## 1. Objetivo e escopo

Este guia explica como **reproduzir, em outra conta AWS Academy**, a infraestrutura já desenvolvida para o As-docs. A abordagem utilizada **não torna os arquivos automaticamente multi-conta**: cada integrante adapta os identificadores da própria conta antes de executar o Terraform, mantendo a arquitetura original.

São três configurações Terraform independentes, executadas nesta ordem:

| Pasta | O que provisiona | Chave no bucket de state | Recursos na reprodução testada |
|---|---|---|---:|
| `infra/terraform` | VPC, sub-redes, NAT, EKS, nós e EBS CSI | `as-docs/terraform.tfstate` | 36 |
| `infra/database` | PostgreSQL RDS, subnet group, parâmetros e regras de segurança | `as-docs/database.tfstate` | 5 |
| `infra/edge` | Duas EC2 frontend, ALB, NLB interno, WAF e integrações | `as-docs/edge.tfstate` | 20 |

**Atenção:** infraestrutura provisionada **não equivale a aplicação publicada**. O deploy de frontend/backend/IA, a integração Keycloak, o domínio e o HTTPS definitivo são etapas separadas.

## 2. Pré-requisitos

- Conta AWS Academy com laboratório iniciado, créditos disponíveis e permissões compatíveis.
- AWS CLI v2, Terraform 1.x compatível com os requisitos do repositório, Python 3 e `kubectl` instalados.
- Repositório `As-docs-app` clonado localmente.
- Credenciais **temporárias** de **AWS Details → AWS CLI**: access key, secret access key e session token. Não incluir esses valores no repositório, na documentação ou em mensagens.
- Acesso às roles **LabEksClusterRole**, **LabEksNodeRole** e **LabRole**, e ao instance profile **LabInstanceProfile**. Os nomes completos das duas roles EKS podem incluir prefixos/sufixos diferentes em cada laboratório.

### 2.1. Autenticação no PowerShell

**Antes de executar os comandos deste guia**, abra o PowerShell **na raiz local da cópia do `As-docs-app`** e defina:

```powershell
$APP_ROOT = (Get-Location).Path
```

Não importa se a pasta está em `C:`, `D:`, outro disco, ou tem nome diferente, desde que seja a raiz correta do repositório. Os caminhos relativos partem de `$APP_ROOT`.

Criar/atualizar `%USERPROFILE%\.aws\credentials` com um perfil local (exemplo):

```ini
[estudante]
aws_access_key_id = VALOR_LOCAL_NAO_COMPARTILHAR
aws_secret_access_key = VALOR_LOCAL_NAO_COMPARTILHAR
aws_session_token = VALOR_LOCAL_NAO_COMPARTILHAR
```

Executar:

```powershell
$env:AWS_PROFILE = "estudante"
aws configure set region us-east-1 --profile estudante
aws sts get-caller-identity --profile estudante --query "{Account:Account,Arn:Arn}" --output table
aws iam list-roles --profile estudante --query "Roles[?contains(RoleName, 'LabEks') || RoleName=='LabRole'].[RoleName,Arn]" --output table
aws iam get-instance-profile --instance-profile-name LabInstanceProfile --profile estudante --query 'InstanceProfile.Roles[].Arn' --output text
```

Anotar **o ID da conta, os ARNs reais das roles e o perfil**, sem registrar as credenciais. Se surgir `ExpiredToken`, renovar a sessão no AWS Details antes de prosseguir.

## 3. Preparar o bucket S3 do estado Terraform

O bucket deve pertencer à **conta de quem está executando**. Na reprodução, utilizou-se o padrão `as-docs-tfstate-<ID_DA_CONTA>-us-east-1`. Nomes de buckets S3 são globais: se o nome não estiver disponível, escolher outro nome e atualizá-lo em **todas** as referências.

No PowerShell:

```powershell
$env:AWS_PROFILE = "estudante"
$conta = (aws sts get-caller-identity --profile estudante --query Account --output text).Trim()
$bucket = "as-docs-tfstate-$conta-us-east-1"

# Primeiro consultar. Se retornar 404, criar; 403 exige investigação.
aws s3api head-bucket --bucket $bucket --profile estudante

# Executar SOMENTE se o bucket ainda não existir:
aws s3api create-bucket --bucket $bucket --region us-east-1 --profile estudante

aws s3api put-public-access-block `
  --bucket $bucket --expected-bucket-owner $conta `
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" `
  --profile estudante

aws s3api put-bucket-encryption `
  --bucket $bucket --expected-bucket-owner $conta `
  --server-side-encryption-configuration "Rules=[{ApplyServerSideEncryptionByDefault={SSEAlgorithm=AES256}}]" `
  --profile estudante

aws s3api put-bucket-versioning `
  --bucket $bucket --expected-bucket-owner $conta `
  --versioning-configuration Status=Enabled --profile estudante
```

Conferir com `head-bucket`, `get-bucket-versioning`, `get-bucket-encryption` e `get-public-access-block`. Antes da primeira gravação de objetos após habilitar versionamento, considerar o período de propagação recomendado pela AWS.

**Não executar** os helpers históricos de `infra/state-backend/bootstrap` ou `infra/state-backend/migracao`: eles documentam a primeira tentativa/migração do Vini, não o procedimento de reprodução em uma conta nova. No Academy, a tentativa original de bootstrap esbarrou em restrição de Object Lock.

## 4. Primeira etapa — `infra/terraform` (rede + EKS)

### 4.1. Ajustes locais

1. Em `infra/terraform/backend.tf`, trocar o bucket e `allowed_account_ids` pela conta do executor; manter a chave `as-docs/terraform.tfstate`, a região, `encrypt = true` e `use_lockfile = true`.
2. Em `infra/terraform/terraform.tfvars`, preencher `expected_account_id`, `aws_region`, `project_name`, `vpc_cidr`, `eks_cluster_role_arn` e `eks_node_role_arn` com dados reais. Na reprodução foram usados `us-east-1`, `as-docs`, `10.0.0.0/16` e `eks_storage_enabled = true`.
3. Com `eks_storage_enabled = true`, o código utiliza a **LabRole** existente no grupo de nós para a integração EBS. O `eks_node_role_arn` ainda deve apontar para a **LabEksNodeRole** real do laboratório, conforme a validação das variáveis.
4. Em `preparar-eks.sh`, `preparar-volumes.py` e `verificar-volumes.py`, trocar as verificações fixas do ID do Vini pelo ID da conta em uso. Em `verificar-volumes.py`, atualizar também o ARN esperado do contexto `kubectl`.
5. Não copiar o ID de VPC de outro integrante: a VPC será criada por este próprio state.

O arquivo de IP de acesso da API EKS pode ser gerado pelo PowerShell, sem executar o helper Bash:

```powershell
Set-Location (Join-Path $APP_ROOT 'infra\terraform')
$env:AWS_PROFILE = "estudante"
$ip = (Invoke-RestMethod "https://checkip.amazonaws.com").Trim()
"eks_api_access_cidrs = [`"$ip/32`"]" | Set-Content -Encoding utf8 eks-acesso.auto.tfvars
```

**O arquivo `eks-acesso.auto.tfvars` é local, não deve ser enviado ao Git nem copiado entre integrantes.** O `/32` é o IP público atual do operador, não deve ser copiado de outra pessoa. Se o IP mudar, revisar a configuração antes de retomar o cluster.

### 4.2. Validar e provisionar

```powershell
terraform init -reconfigure
terraform validate
terraform plan
# Revisar custos, conta, recursos a criar e quaisquer substituições/exclusões.
terraform apply
terraform plan
```

Na **execução de referência de 23/11**: **36 recursos criados**; no final, `No changes`. O número pode variar em outro laboratório e não é condição de aceite. Confirmar:

```powershell
aws eks update-kubeconfig --region us-east-1 --name as-docs-eks --profile estudante
kubectl get nodes
aws eks describe-nodegroup --cluster-name as-docs-eks --nodegroup-name as-docs-private-storage --profile estudante --query "nodegroup.{Status:status,Desired:scalingConfig.desiredSize,Health:health.issues}" --output json
```

Esperado: três nós `Ready`, node group `ACTIVE`, saúde sem problemas. A versão do Kubernetes e dos add-ons deve ser revisada conforme o plano existente e o suporte real do laboratório.

**Configuração Kubernetes adicional:** o arquivo `infra/terraform/storage-gp3.yaml` cria namespace, NetworkPolicy de egress e StorageClass `gp3`. Ele **não é aplicado automaticamente pelo Terraform**. Após conferir o contexto do cluster:

```powershell
kubectl apply -f .\storage-gp3.yaml
kubectl get storageclass gp3
kubectl -n as-docs get networkpolicy workload-egress-without-imds
```

Esse passo é necessário para reproduzir a configuração Kubernetes prevista, mas **não foi confirmado nesta segunda conta durante o teste de Terraform relatado até 23/11**. O teste completo de persistência `verificar-volumes.py` é uma validação adicional, não substituída pela simples presença da StorageClass.

## 5. Segunda etapa — `infra/database` (PostgreSQL RDS)

**Executar somente após o state da rede/EKS estar disponível no S3.** Este módulo consulta os outputs `terraform_remote_state.network`; ele não recria a VPC.

1. Anotar a VPC real, por exemplo com `terraform output -raw vpc_id` **dentro de `infra/terraform`**.
2. Em `infra/database/versions.tf`, atualizar `bucket` e `allowed_account_ids`; preservar a chave `as-docs/database.tfstate`.
3. Em `infra/database/providers.tf`, atualizar o ID permitido no provider e no bloco `terraform_remote_state.network`, inclusive o nome do bucket de rede.
4. Em `infra/database/main.tf`, atualizar a verificação fixa da VPC para o ID recém-criado (sem mexer nas referências dinâmicas aos outputs da rede).
5. Em `infra/database/preparar-banco.py`, atualizar a constante de conta autorizada.

```powershell
Set-Location (Join-Path $APP_ROOT 'infra\database')
$env:AWS_PROFILE = "estudante"
python .\preparar-banco.py
terraform init -reconfigure
terraform validate
terraform plan
# Aplicar apenas depois de revisar o plano e confirmar créditos/permissões:
terraform apply
terraform plan
terraform output
```

O helper seleciona uma versão de PostgreSQL disponível e cria arquivos locais `database-settings.auto.tfvars.json` e `database-secrets.auto.tfvars.json`. **Preservar a senha gerada; nunca publicar ou compartilhar esses arquivos.** Na reprodução histórica de referência foram selecionados PostgreSQL **18.6**, `db.t3.micro`, `gp2` de 20 GiB e **Multi-AZ**, com TLS obrigatório. Foram **5 recursos criados** e `No changes` no final daquele teste; **não presumir os mesmos números/opções em outra conta**.

O RDS é privado, tem proteção contra exclusão e snapshot final configurados. Planejar a desmontagem com cuidado.

## 6. Terceira etapa — `infra/edge` (EC2, ALB, NLB e WAF)

**Executar somente após a rede e os três nós EKS estarem operacionais.** Nesta configuração o frontend será publicado depois, nas duas EC2.

1. Em `infra/edge/versions.tf`, atualizar o bucket e a conta; manter a chave `as-docs/edge.tfstate`.
2. Em `infra/edge/providers.tf`, atualizar conta do provider e do `terraform_remote_state.network`.
3. Em `infra/edge/frontend.tf`, atualizar os identificadores de conta/VPC nas validações de segurança.
4. Em `infra/edge/variables.tf`, atualizar a conta no padrão de validação do ARN ACM.
5. Em `infra/edge/preparar-borda.py`, `verificar-borda.py` e `tests/edge.tftest.hcl`, atualizar conta/VPC fixas, inclusive o ARN do contexto EKS.
6. Confirmar que **LabInstanceProfile** referencia a **LabRole** da conta do executor (o comando também está na seção 2):

```powershell
aws iam get-instance-profile --instance-profile-name LabInstanceProfile --profile estudante --query 'InstanceProfile.Roles[].Arn' --output text
aws iam get-role --role-name LabRole --profile estudante --query 'Role.Arn' --output text
```

Os dois ARNs devem apontar à role da **mesma conta**. Não criar roles novas sem autorização do laboratório.

```powershell
Set-Location (Join-Path $APP_ROOT 'infra\edge')
$env:AWS_PROFILE = "estudante"
python .\preparar-borda.py
terraform init -reconfigure
terraform validate
terraform test
terraform plan
# Aplicar apenas depois de conferir conta, 20 criações e custos:
terraform apply
terraform plan
terraform output
```

Na reprodução histórica, `preparar-borda.py` passou, **3 testes Terraform passaram**, o plano indicou **20 adições, nenhuma alteração ou exclusão**, e o `apply` terminou normalmente. O plano posterior foi `No changes`. O ALB público (`as-docs-public`) e o NLB interno (`as-docs-internal`) apareceram `active`.

Sem `public_hostname` e certificado ACM válido, `tls_enabled = false`: a borda funciona **somente com HTTP temporário**, não com HTTPS definitivo. Mesmo com os balanceadores ativos, os Target Groups podem ficar `unhealthy` até o deploy real.

Verificação adicional após bootstrap EC2/SSM:

```powershell
python .\verificar-borda.py
```

O comando acima verifica requisitos de infraestrutura, mas **não foi executado na conta reproduzida durante a validação descrita aqui**. Após o deploy da aplicação, usar `python .\verificar-borda.py --aplicacao` e realizar testes funcionais específicos do grupo.

## 7. Evidências obtidas em 23/11/2026

A reprodução na segunda conta AWS Academy (`us-east-1`) apresentou:

| Etapa | Evidência observada |
|---|---|
| Rede e EKS | 36 recursos no state; `terraform plan` → `No changes`; EKS e Node Group `ACTIVE`; 3 nós `Ready` |
| Banco | `Apply complete! Resources: 5 added`; `terraform plan` → `No changes` |
| Borda | `Apply complete! Resources: 20 added`; `terraform test` → `3 passed, 0 failed`; `terraform plan` → `No changes`; ALB/NLB `active` |
| Total | **61 recursos Terraform**, distribuídos em 3 states S3 distintos |

Houve duas interrupções por **falha temporária de resolução DNS ao enviar o state para S3** durante a criação do EKS. A recuperação foi feita conferindo os recursos reais, `terraform state list` e um novo `terraform plan`. O state remoto continha os recursos criados, e o resultado final convergiu para `No changes`. **Não** executar `destroy`, `state push`, novo `init -reconfigure` ou novos `apply` indiscriminados em casos semelhantes: verificar o state primeiro.

Esta evidência comprova o **provisionamento da infraestrutura**, não a publicação ou o funcionamento completo do chat de IA.

## 8. Cuidados, limitações e entrega ao grupo

- Não compartilhar `.aws/credentials`, arquivos de senha (`database-secrets.auto.tfvars.json`), `.env` reais, `*.tfstate`, `*.tfplan`, backups, chaves privadas, `eks-acesso.auto.tfvars` ou conteúdos do state S3. O arquivo `terraform.tfvars` do projeto contém IDs/ARNs, **não segredos**, mas cada executor precisa adaptar seus valores.
- Antes do PR, revisar `git status` e `git diff` para não sobrescrever inadvertidamente os IDs/ARNs configurados na conta do colega nem publicar arquivos locais. Este guia documenta a execução individual, **não** substitui uma revisão coordenada das alterações do grupo.
- Os arquivos de `infra/state-backend/bootstrap` e `infra/state-backend/migracao` contêm referências **históricas** à conta do Vini. Não executá-los para uma nova reprodução nem alterá-los apenas para apagar referências antigas.
- Os três states devem permanecer separados. **Não copiar o state de um integrante para outro**, nem apontar a conta de uma pessoa para o bucket S3 de outra.
- O AWS Academy pode impor cotas, restrições e expiração de sessão; o saldo de créditos deve ser acompanhado. EKS, nós EC2, NAT Gateways, RDS Multi-AZ, ALB, NLB e WAF consomem recursos cobrados por uso.
- Planejar a desativação do ambiente de teste. O RDS tem `deletion_protection = true` e snapshot final; não executar `terraform destroy` sem planejar esses requisitos e a ordem de dependências. Não apagar o bucket de state antes do descomissionamento correto.
- O domínio e HTTPS foram **validados na conta principal em 24/11**, mas não são cobertos pelos comandos deste guia de infraestrutura. Keycloak/OIDC definitivo, CI/CD/SonarQube e os testes da aplicação nas demais contas continuam pendentes ou fora deste escopo: ver `GUIA_DEPLOY_AWS_MULTICONTA.md`.

## 9. Referências internas do repositório

- `infra/terraform/README.md`, `ETAPA_03_EKS.md`, `ETAPA_05_VOLUMES.md` e `storage-gp3.yaml`.
- `infra/database/README.md` e `ENTREGA_AO_MUCI.md`.
- `infra/edge/README.md`, `ENTREGA_AO_MUCI.md` e `backend-service.yaml`.
- `infra/state-backend/README.md` (histórico de bootstrap e migração; não executar novamente).

---

**Conclusão:** em 23/11/2026 houve evidência de reprodução dos **três módulos de infraestrutura** em uma segunda conta AWS Academy, preservando os três states separados; em 24/11/2026 a **aplicação principal** foi validada por HTTPS/E2E e colaboração. A validação funcional das contas restantes exige testes próprios. Para a implantação completa, seguir `GUIA_DEPLOY_AWS_MULTICONTA.md`.
