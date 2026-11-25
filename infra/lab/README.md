# AWS: uma implantação por conta

Use `infra/lab` para uma implantação nova, sem infraestrutura preexistente do projeto. Essa raiz cria VPC, EKS, CSI EBS, RDS privado, duas EC2, ALB, NLB e WAF em `us-east-1`, com um único `terraform.tfstate` local. Ela não precisa do bucket S3, do state nem das roles da conta do grupo.

- **`learner_lab` (padrão):** reutiliza as roles `LabEksClusterRole`, `LabEksNodeRole`, `LabRole` e o `LabInstanceProfile` já fornecidos pelo Academy na sua conta. Não cria roles, não anexa políticas e não cria associações de Pod Identity. O RDS recebe a senha pelo argumento write-only, sem depender da integração com o Secrets Manager.
- **`managed`:** para uma conta em que a sessão pode criar e passar roles, anexar políticas, configurar Pod Identity e criar o segredo gerenciado do RDS. Configure `iam_mode = "managed"` e não informe `TF_VAR_db_password`. Se você já aplicou a versão anterior que criava IAM, mantenha `managed` naquele state. Não alterne os modos em uma implantação existente.

As pastas `infra/terraform`, `infra/database` e `infra/edge`, usadas diretamente, continuam atendendo à implantação compartilhada anterior. Não migre, importe ou copie o state dessa implantação para `infra/lab`. O Terraform pode avisar que ignorou os backends S3 dos módulos filhos; isso é esperado.

## Pré-requisitos na sua conta (AWS Academy ou conta própria)

1. Autentique-se na AWS e confirme a conta com `aws sts get-caller-identity --query Account --output text`. O Terraform detecta o ID da sessão e vincula o state a essa conta no primeiro `apply`. `expected_account_id` é opcional e trava a conta antes mesmo do primeiro plano. Use Terraform 1.11 ou superior e região `us-east-1`.
2. No Learner Lab, o Terraform procura os identificadores `LabEksClusterRole` e `LabEksNodeRole` com `iam:ListRoles`, incluindo nomes com prefixo/sufixo. Se a listagem for negada ou não houver uma única correspondência, consulte o console do **seu** laboratório e informe `eks_cluster_role_arn` e `eks_node_role_arn` no `terraform.tfvars` para dispensar a descoberta. O Terraform ainda precisa poder consultar o perfil EC2, consultar `LabRole` quando o CSI estiver ativo e passar as roles preexistentes (`iam:PassRole`). Não use ARNs da conta do grupo.
3. Informe o IPv4 público de saída do operador como `/32`. Não abra o endpoint do EKS para toda a internet. Confirme versões, disponibilidade e cotas para EKS, EC2, NAT, RDS Multi-AZ, balanceadores e WAF. Se uma ação for negada, não prossiga sem confirmar que o seu laboratório a permite.

## Inicializar e provisionar

A partir da raiz do repositório, execute em um shell autenticado na sua conta:

```bash
cd infra/lab
umask 077
cp lab.tfvars.example terraform.tfvars
# Edite terraform.tfvars: informe o IPv4 público de saída do operador como /32.
# No modo learner_lab, use uma senha de 32 a 128 caracteres alfanuméricos.
read -rsp 'Senha administrativa do RDS: ' TF_VAR_db_password; printf '\n'
export TF_VAR_db_password
terraform init
terraform validate
terraform plan
```

Revise a conta, a região e os recursos propostos. Depois, execute `terraform apply` no mesmo shell e revise o plano antes de confirmar. Guarde a senha em um gerenciador de senhas: ela não fica no plano nem no state e deve ser fornecida novamente ao retomar o Learner Lab. Incremente `db_password_revision` apenas para rotacioná-la de propósito. Para atualizar a infraestrutura, renove as credenciais temporárias quando expirarem e volte ao mesmo diretório com o mesmo state. Não adicione state, backups ou arquivos de variáveis ao Git. Guarde uma cópia privada do state se o diretório do CloudShell não for persistente. Não reutilize o state de um laboratório resetado sem conferir o que restou.

## Publicação da aplicação e encerramento

### Deploy integral em um Learner Lab novo

O modo `lab_full_deploy = true` é para um laboratório descartável, com state
novo e sem recursos anteriores do projeto. Não o habilite para migrar uma
instalação existente. Clone a revisão compatível de `As-docs-ai` ao lado deste
repositório (ou ajuste `lab_ai_checkout`) e use um shell com AWS CLI,
`kubectl`, Docker com suporte a build `linux/amd64`, Python 3, OpenSSL, Git e
curl. O mesmo shell deve alcançar a API do EKS a partir do IPv4 `/32`
informado em `eks_api_access_cidrs`.

Ative `lab_full_deploy` no `terraform.tfvars`, configure `openai.auto.tfvars`
como abaixo e deixe `app_deploy` e `ai_oauth` sem valor. Use os comandos de
inicialização e provisionamento acima: não há uma etapa separada de push das
imagens ou de criação dos Secrets. O `apply` publica as três imagens no ECR
da própria conta, prepara PostgreSQL e Keycloak, implanta backend e IA no
EKS e o frontend nas duas EC2. Use `terraform output -raw public_app_url`
para obter o endereço. Esse modo usa o DNS HTTP do ALB e contas de teste;
não o use para dados reais. O acesso administrativo do Keycloak permanece
privado.

As tags são automáticas. Ao manter o código, só regenere o manifesto
versionado `deploy/aws-lab-build-inputs.json` do repositório afetado se a
lista de entradas de build mudar (por exemplo, ao adicionar ou remover um
arquivo-fonte). Da raiz do app, `bash deploy/publish-aws-lab-images.sh
--build-manifest app .` imprime a lista do app; use `--build-manifest ai
../As-docs-ai` para a lista da IA. Revise e salve a saída no repositório
correspondente. Um clone da revisão publicada já traz os dois manifestos.

### Deploy com imagens já publicadas

Para publicar pelo próprio `apply`, configure `app_deploy` em `terraform.tfvars`
com os digests de backend e frontend do ECR desta conta (`lab.tfvars.example`).
Prepare o banco e o usuário do app, o Secret `as-docs/as-docs-backend-secret`
e o cliente OIDC antes de habilitar o deploy. O Terraform não recebe esses
segredos nem compila imagens. Com a configuração ativa, o `apply` aguarda o
Keycloak e instala Redis e backend no EKS, depois atualiza as duas EC2 por SSM
e verifica as sondas. Para incluir a IA, configure também `ai_oauth` com o
mesmo digest de backend e os pré-requisitos de OAuth. Sem `app_deploy`, as EC2
podem subir sem contêineres e a URL do app devolver 502.

Para criar também o Secret da OpenAI, copie `openai.tfvars.example` para
`openai.auto.tfvars` **em `infra/lab`**, com permissão `0600`. Preencha
`openai_api_key` e deixe `openai_secret_revision = 1` na primeira entrega.
O Terraform carrega o arquivo automaticamente, sem `-var-file` adicional.
O valor não vai para o Git, plano ou state. Isso não ativa `ai_oauth` sozinho.

- `terraform output` fornece o cluster EKS, a conexão do RDS, a URL pública e o endpoint privado do backend. O ARN do segredo gerenciado só aparece em `managed`. Use a senha administrativa apenas para preparar o banco e crie credenciais específicas para os workloads. Siga [Deploy na AWS](../../deploy/README.md) para o primeiro deploy. Depois, a opção [`ai_oauth`](../../docs/tcc/13-ia-oauth-aws.md) implanta a IA privada e ativa Client Credentials no backend sem publicar imagens nem tocar no frontend.
- O CSI fica habilitado por padrão. No Learner Lab, ele usa as permissões da `LabRole` dos nós, sem o isolamento de Pod Identity. Depois do `apply`, confirme o contexto `kubectl` e aplique [`storage-gp3.yaml`](../terraform/storage-gp3.yaml) **antes** de subir workloads no namespace `as-docs`: o manifesto configura a classe `gp3` e a política de egress contra IMDS. Respeite as limitações descritas na [Etapa 05](../terraform/ETAPA_05_VOLUMES.md), incluindo a janela inicial do CNI. Se não precisar de PVCs, você pode usar `eks_storage_enabled = false` em uma implantação nova. Volumes com `Retain` podem ficar cobrando após a remoção do workload.
- Keycloak fica desativado por padrão. Sua ativação exige domínio, DNS, certificado ACM e preparação do banco e do cluster segundo `infra/edge/KEYCLOAK.md`; use os dados da sua conta e não os IDs ou contextos históricos da conta compartilhada.
- Nem a portabilidade nem o limite de três nós adicionam HPA/Cluster Autoscaler. Para avaliar os recursos de autoscaling na sessão, veja `docs/tcc/11-autoscaling-academy.md`.
- Ao terminar, confira o contexto antes de remover os workloads e revise `terraform plan -destroy` antes de confirmar `terraform destroy`, sempre na mesma conta e no mesmo diretório/state. Não apague o state enquanto houver infraestrutura sob seu controle. A remoção do RDS de laboratório descarta seus dados.
