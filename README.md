# As-docs-app

Versão do tcc-docs-app preparada para a AWS (trabalho de Auditoria e Segurança de Sistemas),
separada em **frontend** (Nginx, EC2 em subnet pública) e **backend** (NestJS, EKS em subnet privada).

| Pasta | Conteúdo |
|---|---|
| `frontend/` | Dockerfile + Nginx (estáticos, proxy `/api` `/socket.io` `/collab` → `BACKEND_URL`) |
| `backend/` | Dockerfile só da API |
| `deploy/ec2/` | compose e user-data das EC2 do frontend |
| `deploy/k8s/` | namespace, Redis 8, backend (ConfigMap, Secret, NLB interno, NetworkPolicy) |
| `docker-compose.yml` | stack local com a mesma separação (abre em http://localhost:8080) |

## Deploy completo no AWS Academy Learner Lab

Use este fluxo em um laboratório descartável, sem recursos anteriores do
projeto e com um state Terraform novo. Não use o state do grupo nem habilite
`lab_full_deploy` em uma instalação existente.

Use Bash com Git, Terraform 1.11 ou superior, AWS CLI, `kubectl`, Docker
rodando com suporte a builds `linux/amd64`, Python 3, OpenSSL e `curl`.

### 1. Clone os dois repositórios lado a lado

```bash
git clone --branch feat/infra-learner-lab https://github.com/Albibino/As-docs-app.git
git clone --branch keycloak-implementation https://github.com/Albibino/As-docs-ai.git
cd As-docs-app/infra/lab
```

Confira se a revisão publicada nos dois repositórios já inclui os arquivos
abaixo. Se algum estiver faltando, não prossiga com o `apply`.

```bash
test -f full-deploy.tf &&
test -f openai.tfvars.example &&
test -f ../../deploy/aws-lab-build-inputs.json &&
test -f ../../../As-docs-ai/deploy/aws-lab-build-inputs.json &&
test -f ../../../As-docs-ai/deploy/render-aws-oauth.sh &&
printf 'Arquivos do deploy encontrados.\n'
```

### 2. Autentique-se na AWS e descubra o seu IPv4

Inicie seu Learner Lab e carregue as credenciais temporárias dele no mesmo
terminal em que vai rodar o Terraform:

```bash
aws sts get-caller-identity --query Account --output text
curl -4fsS https://checkip.amazonaws.com
```

Confirme que o ID retornado é o da sua conta de laboratório. Use o IPv4
retornado pelo segundo comando com `/32`. É a saída da máquina que acessará
a API do EKS; não use `0.0.0.0/0`.

### 3. Configure o deploy e os segredos

```bash
umask 077
cp -n lab.tfvars.example terraform.tfvars
cp -n openai.tfvars.example openai.auto.tfvars
chmod 600 openai.auto.tfvars
```

Em `terraform.tfvars`, substitua o IP de exemplo e habilite o modo integral:

```hcl
eks_api_access_cidrs = ["SEU_IPV4/32"]
lab_full_deploy     = true
```

Deixe `app_deploy` e `ai_oauth` comentados. Em `openai.auto.tfvars`, preencha
`openai_api_key` com a chave do projeto e mantenha `openai_secret_revision = 1`.
O Terraform lê esse arquivo automaticamente. Não envie o arquivo nem o
state ao Git.

Informe uma senha administrativa nova para o RDS, com 32 a 128 caracteres
alfanuméricos. Guarde-a em um gerenciador de senhas e use a mesma ao retomar
o deploy:

```bash
read -rsp 'Senha administrativa do RDS: ' TF_VAR_db_password; printf '\n'
export TF_VAR_db_password
```

### 4. Revise o plano e aplique

```bash
terraform init
terraform validate
terraform plan
```

Confira a conta, a região `us-east-1` e os recursos propostos. Se o plano
indicar remoção de recursos existentes no primeiro deploy, pare. Caso
contrário, no mesmo terminal, revise o plano exibido antes de confirmar:

```bash
terraform apply
```

O modo integral publica as imagens da aplicação e da IA no ECR da sua conta,
prepara PostgreSQL e Keycloak e sobe Redis, backend, frontend e IA. Não é
preciso criar tags, publicar imagens ou criar Secrets no Kubernetes à mão.
O fluxo foi testado offline; o primeiro `apply` completo em uma conta nova
ainda não foi validado.

### 5. Abra e teste a aplicação

```bash
terraform output -raw public_app_url
```

Abra a URL e entre como `usuario-1` ou `usuario-2`. Somente nessas contas
descartáveis a senha é igual ao login. Crie um documento e envie uma mensagem
no chat da IA para testar o fluxo completo. O endereço público usa HTTP:
não use esse laboratório para dados reais.

Veja [requisitos e restrições do laboratório](infra/lab/README.md) e, se
já tiver imagens publicadas, o [guia de deploy por digest](deploy/README.md).

---

# tcc-docs-app

App de documentação colaborativa do TCC. Tem dois usuários
fixos ("Usuário 1" e "Usuário 2"), que entram sem login. Há um único workspace,
um único time e um único space, e a edição em tempo real continua funcionando.
A IA (repositório irmão [`tcc-docs-ai`](../tcc-docs-ai)) conversa e tira
dúvidas sobre os documentos e oferece escrita assistida.

O ponto central é a IA sobre um **índice vetorial versionado**:
- toda alteração gera uma nova versão da página;
- só versões novas são indexadas;
- quando o índice está atrás do app, a IA lê a página atual pelo MCP
  (`docs.read_page`) antes de responder.

Documentação completa em [`docs/tcc/`](docs/tcc/README.md). Orientações para
agentes em [`AGENTS.md`](AGENTS.md).

## Como executar

Com Docker (app + IA + Postgres + Redis 8):

```bash
cp .env.example .env
sed -i "s/^APP_SECRET=.*/APP_SECRET=$(openssl rand -hex 32)/" .env
sed -i "s/^DOCS_AI_HMAC_SECRET=.*/DOCS_AI_HMAC_SECRET=$(openssl rand -hex 32)/" .env
docker compose up --build
```

Abra `http://localhost:8080`. Veja [Keycloak na stack local](docs/tcc/10-keycloak-local.md)
para ativar o login dos dois usuários vinculados e, separadamente, Client
Credentials entre o backend e a IA. Sem `OIDC_ENABLED=true`, o Compose
preserva o seletor legado, sem credenciais; não o exponha fora do laboratório.

Teste ponta a ponta (com a stack no ar):

```bash
python3 scripts/tcc-e2e.py http://localhost:3001
```

Publicação no Railway: [`docs/tcc/06-docker-e-railway.md`](docs/tcc/06-docker-e-railway.md).

## Recursos mantidos

- Colaboração em tempo real
- Diagramas com Draw.io, Excalidraw e Mermaid
- Comentários e histórico de versões
- Busca, anexos, incorporações e exportação
- Interface traduzida para vários idiomas

Removidos para o TCC: login, convites, publicação e compartilhamento público,
criação de times e spaces. Ver [`docs/tcc/02-cortes-de-funcionalidade.md`](docs/tcc/02-cortes-de-funcionalidade.md).

## Licença

Este projeto é distribuído sob a **GNU Affero General Public License v3.0**
(AGPL-3.0); o texto completo está em [LICENSE](LICENSE).

Ele é derivado do [Docmost](https://github.com/docmost/docmost), de
Docmost, Inc. O aviso **Copyright (c) Docmost, Inc.** e a atribuição ao código
original são preservados. Só o núcleo AGPL-3.0 do Docmost faz parte deste
repositório: o código sob a *Docmost Enterprise License* (as pastas `ee/` e o
pacote de fórmulas de bases) foi removido e não pode voltar. Ver
[`docs/tcc/02-cortes-de-funcionalidade.md`](docs/tcc/02-cortes-de-funcionalidade.md)
e a decisão D13 em [`docs/tcc/03-decisoes.md`](docs/tcc/03-decisoes.md).

O chat e a escrita assistida foram escritos para o TCC (AGPL-3.0), fora do
código empresarial.

## Licenças de terceiros

Os arquivos `LICENSE` incluídos em subdiretórios (dependências e assets de
terceiros) são mantidos sem alterações para preservar as atribuições do código
original.
