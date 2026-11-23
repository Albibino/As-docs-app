# As-docs — Terraform, etapa 01: rede

Primeiro bloco da infraestrutura do trabalho de Auditoria e Segurança de Sistemas,
para receber As-docs-app e As-docs-ai no AWS Academy Learner Lab.

Em 22/11/2026, o usuário criou os 22 recursos desta etapa e confirmou um plano
posterior sem diferenças. Resultados e evidências: `VERIFICACAO.md`.
IDs dos recursos e orientação para o grupo: `ENTREGA_AO_GRUPO.md`.

O state foi migrado para S3 e verificado com `init`, os 22 recursos gerenciados
na lista e um novo plano sem diferenças. `backend.tf` registra o backend remoto;
quem executar deve usar uma sessão AWS autorizada na conta do laboratório.

## Entrega desta etapa

| Recurso | Finalidade |
|---|---|
| 1 VPC com DNS habilitado | Rede do projeto. |
| 2 sub-redes públicas em zonas diferentes | Receber ALB e EC2 do frontend. |
| 2 sub-redes privadas nas mesmas zonas | Receber EKS, banco e balanceador interno. |
| Internet Gateway e rota pública | Saída das futuras instâncias públicas para a internet. |
| Tabelas de rotas privadas | Base para adicionar NAT na etapa EKS. |
| Security Groups do ALB e do frontend | HTTP no frontend somente a partir do balanceador. |
| Outputs | IDs e CIDRs para integrar as próximas etapas. |

O código não cria usuários, funções ou políticas IAM. Os dois ARNs recebidos do
Academy ficam reservados para a próxima etapa. Ainda será preciso consultar suas
políticas antes de configurar cluster, nós e complementos.

Esta entrega é somente a rede. ALB, WAF, EC2, EKS, NLB, NAT, RDS, Redis, imagens e
deploy dos containers entram nas próximas etapas. As sub-redes privadas têm
somente rotas locais nesta versão: workloads privados que baixam imagens ou
acessam a OpenAI precisarão da saída NAT e suas rotas antes do deploy.

## Parâmetros

`terraform.tfvars` contém a conta e os dois ARNs informados pelo usuário. São
identificadores de recursos, não credenciais. A autenticação utiliza a sessão
ativa do AWS Academy, sem armazenar chaves de acesso no projeto.

A região usada é `us-east-1`, permitida pelo Readme do laboratório. O usuário
confirmou que a implantação final continuará na conta `967931808920`, onde a rede
já foi criada. O provider recusa uma conta diferente de `expected_account_id`.

| Faixa padrão | Uso |
|---|---|
| `10.0.0.0/16` | VPC |
| `10.0.0.0/24` e `10.0.1.0/24` | Sub-redes públicas |
| `10.0.10.0/24` e `10.0.11.0/24` | Sub-redes privadas |

O código escolhe duas zonas normais disponíveis na conta/região. Se alterar o
CIDR, ajuste também `loadBalancerSourceRanges` e `ipBlock` em
`deploy/k8s/22-backend.yaml` do app, que ainda usa as faixas originais.

## 1. Instalar o Terraform

Inicie o Learner Lab, entre no console AWS e abra o CloudShell. O CLI AWS já usa a
autenticação dessa sessão. Para o Amazon Linux 2023, use o repositório HashiCorp:

```bash
sudo dnf install -y dnf-plugins-core shadow-utils
sudo dnf config-manager --add-repo https://rpm.releases.hashicorp.com/AmazonLinux/hashicorp.repo
sudo dnf install -y terraform
mkdir -p "$HOME/.local/bin"
if [ "$(command -v terraform)" != "$HOME/.local/bin/terraform" ]; then
  cp "$(command -v terraform)" "$HOME/.local/bin/terraform"
fi
export PATH="$HOME/.local/bin:$PATH"
terraform version
```

Se a instalação falhar, preserve a mensagem para identificar o ajuste.

A cópia em `$HOME/.local/bin` preserva o executável entre sessões. As mudanças do
sistema feitas por `dnf` ficam fora do diretório pessoal e podem desaparecer ao
reciclar o ambiente. Nas próximas sessões, carregue `cloudshell-env.sh` na pasta
do projeto para configurar `PATH` e `TF_DATA_DIR` antes dos comandos Terraform.

## 2. Enviar e extrair

As instruções de primeira implantação abaixo ficam como referência. Nesta conta,
a rede já existe: continue da pasta que contém seu state. O ZIP atualizado traz
código e evidências e não inclui o state da infraestrutura criada.

No CloudShell, use **Actions > Upload file** para enviar
`As_docs_Terraform_Etapa_01.zip`.

```bash
unzip As_docs_Terraform_Etapa_01.zip
cd as-docs-terraform-etapa-01
```

Para incorporar ao repositório do grupo, copie a pasta para `infra/terraform` do
As-docs-app. Preserve o state do ambiente em que o código tiver sido aplicado.

## 3. Validar e planejar

O CloudShell oferece 1 GB de armazenamento persistente no diretório pessoal.
O provider AWS 6.73.0 tem aproximadamente 800 MB depois de descompactado; o
download e a extração podem esgotar esse espaço. Use a área temporária para os
dados regeneráveis, mantendo código e state na pasta atual do projeto.

Confira o espaço disponível antes da inicialização:

```bash
df -h "$HOME" /tmp /var/tmp
```

Na sessão informada pelo usuário, `/var/tmp` tinha 9,2 GB livres, enquanto o
diretório pessoal tinha 145 MB. Carregue a configuração e inicialize assim:

```bash
source ./cloudshell-env.sh
TMPDIR=/var/tmp terraform init
terraform fmt -check -recursive
terraform validate
terraform test
terraform plan -out=rede.tfplan
terraform show -no-color rede.tfplan
```

O `TF_DATA_DIR` aponta o diretório de dados regeneráveis para `/var/tmp`, e o
`TMPDIR` nesse comando posiciona ali os arquivos temporários da instalação.
Carregue `cloudshell-env.sh` novamente a cada nova sessão antes dos comandos
Terraform. Se o CloudShell remover a área temporária, repita o `init`: os
providers podem ser baixados novamente. O state ativo fica no backend S3;
preserve as cópias locais anteriores como backup.

Se sua pasta ainda for a primeira versão do pacote, que não incluía esse script,
configure manualmente:

```bash
export PATH="$HOME/.local/bin:$PATH"
export TF_DATA_DIR="/var/tmp/as-docs-terraform-data-${UID}"
mkdir -p "$TF_DATA_DIR"
TMPDIR=/var/tmp terraform init
```

### Se o init anterior falhou com falta de espaço

Dentro desta pasta de projeto, remova apenas a instalação parcial dos providers:

```bash
rm -rf -- .terraform/providers
source ./cloudshell-env.sh
TMPDIR=/var/tmp terraform init
```

`providers` é uma pasta de dependências reinstaláveis. Preserve o
`terraform.tfstate`, seu backup, os arquivos `.tf` e o `.terraform.lock.hcl`.

`terraform test` usa um provider simulado: verifica exposição do frontend, IPs
privados, distribuição em duas zonas e rejeição de região/ARNs incompatíveis.
Esses testes não fazem chamadas à AWS. O `plan` usa o provider real, confere a
conta e lê as zonas disponíveis para planejar os recursos.

Em uma primeira execução, o plano deve propor somente a criação dos recursos de
rede descritos acima. A consulta de funções já ter funcionado não prova permissão
para todas as operações futuras do EKS ou de seus complementos.

## 4. Aplicar a rede

Depois de conferir o destino e o plano:

```bash
terraform apply rede.tfplan
terraform output
```

Não use `-auto-approve`. Se o plano salvo ficar desatualizado, gere outro plano.
Um erro `AccessDenied` deve ser analisado a partir da operação negada, respeitando
as permissões do laboratório.

## Estado e colaboração

O state ativo está no S3 configurado em `backend.tf`. Ele vincula o código aos
recursos existentes. Inclua `backend.tf` e `.terraform.lock.hcl` no Git; eles
guardam a configuração do backend e a versão do provider. States, backups,
`.terraform/` e planos ficam fora do Git, conforme o `.gitignore`.

O armazenamento temporário serve somente aos dados de trabalho e dependências;
não mova o projeto inteiro nem o state para `/tmp` ou `/var/tmp`.

O backend S3 compartilhado usa `use_lockfile = true`. O acesso ao GitHub não
concede acesso AWS: cada executor precisa de uma sessão autorizada e das
permissões de acesso ao state e ao lock. Coordenem as alterações da configuração
e mantenham os executores usando esse mesmo backend.

Guarde como evidências o plano, os outputs, as quatro sub-redes com suas zonas e
as regras dos Security Groups. Depois, será preciso testar funcionamento da
aplicação e recuperação de dados para completar a avaliação.

Para remover exclusivamente os recursos gerenciados por este state, confira o
plano de destruição antes da execução:

```bash
terraform plan -destroy
terraform destroy
```

Dimensione os custos das próximas etapas antes de criar EKS, RDS, NAT e
balanceadores. Encerrar a sessão do laboratório não garante que todos esses
recursos parem de consumir seu orçamento.

## Próximas etapas

- Usar o backend S3 já migrado para continuar a infraestrutura existente.
- Preparar o EKS com três nós privados, conforme confirmação de William.
- Conferir políticas e relações de confiança das funções existentes do EKS.
- Fechar a configuração de PostgreSQL 18 e Redis 8; a IA usa Vector Sets.
  Os manifests compartilham uma instância Redis. Não foi identificada integração
  DynamoDB nos projetos recebidos.
- Configurar NAT, EKS, nós e complementos necessários aos manifests: balanceador
  interno, armazenamento persistente e políticas de rede.
- Integrar RDS, EC2, ALB, WAF, domínio/certificado e as imagens do CI/CD.
- Definir backups e procedimento de recuperação para demonstrar DR.

## Referências

- https://developer.hashicorp.com/terraform/install
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- https://docs.aws.amazon.com/cloudshell/latest/userguide/welcome.html
- https://developer.hashicorp.com/terraform/language/tests/mocking

O Readme do laboratório enviado pelo usuário é a referência para as restrições
específicas de sua conta.
