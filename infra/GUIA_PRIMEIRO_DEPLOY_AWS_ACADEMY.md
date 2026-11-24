# As-docs — primeiro deploy em outra conta AWS Academy

**Revisão:** 24/11/2026 · **Público:** integrantes do grupo, cada um com uma AWS Academy Learner Lab independente.

> **Este guia é um ponto de entrada, não um instalador automático.** Siga em conjunto [GUIA_REPRODUCAO_AWS.md](GUIA_REPRODUCAO_AWS.md), [GUIA_AJUSTES_MANUAIS_POR_CONTA.md](GUIA_AJUSTES_MANUAIS_POR_CONTA.md), [GUIA_DEPLOY_AWS_MULTICONTA.md](GUIA_DEPLOY_AWS_MULTICONTA.md) e [README-OAUTH-TLS.md](../deploy/k8s/README-OAUTH-TLS.md). Não executar os scripts ou manifestos de outra conta sem adaptar identificadores e configuração. Os três outros ambientes ainda precisam de validação funcional independente.

## 1. Preparar o laboratório e a CLI

1. Abrir o curso **AWS Academy Learner Lab** e acessar o ambiente do laboratório.
2. Clicar em **Start Lab** e aguardar o laboratório indicar que está pronto; abrir o console AWS pelo link **AWS** disponibilizado na página.
3. Na página do laboratório, abrir **AWS Details → AWS CLI → Show**. Copiar **somente para o computador local**, sem enviar em chat, Git ou capturas, os três campos de acesso temporário: `aws_access_key_id`, `aws_secret_access_key` e `aws_session_token`. A interface pode variar ligeiramente.
4. No Windows, editar `%USERPROFILE%\.aws\credentials` e criar/atualizar o perfil (não deixar valores fictícios):

   ```ini
   [estudante]
   aws_access_key_id = SEU_VALOR_TEMPORARIO
   aws_secret_access_key = SEU_VALOR_TEMPORARIO
   aws_session_token = SEU_VALOR_TEMPORARIO
   ```

5. No PowerShell, limpar eventuais variáveis antigas que poderiam ter precedência sobre o perfil:

   ```powershell
   Remove-Item Env:AWS_ACCESS_KEY_ID,Env:AWS_SECRET_ACCESS_KEY,Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
   $env:AWS_PROFILE = 'estudante'
   $env:AWS_DEFAULT_REGION = 'us-east-1'
   aws configure set region us-east-1 --profile estudante
   aws sts get-caller-identity --profile estudante
   aws iam list-roles --profile estudante --query "Roles[?contains(RoleName, 'LabEks') || RoleName=='LabRole'].[RoleName,Arn]" --output table
   aws iam get-instance-profile --instance-profile-name LabInstanceProfile --profile estudante
   ```

6. Anotar **o ID de 12 dígitos da SUA conta** e os ARNs exatos das roles. Não assumir que os nomes e sufixos são idênticos aos da conta principal. Caso `ExpiredToken`, voltar ao AWS Details e atualizar os três valores no arquivo local.
7. Instalar e conferir Git, AWS CLI v2, Terraform compatível com o repositório, Docker, Python 3, `kubectl` e, para gerar TLS interno, OpenSSL. Para executar scripts `.sh`, utilizar um shell Bash disponível.
8. Clonar os dois repositórios nos **commits/branches combinados** pelos quatro integrantes; não utilizar ZIP desatualizado, nem misturar branches de versões incompatíveis.

## 2. Identificar o ambiente destino antes de criar recursos

Registrar localmente, sem credenciais: conta AWS, região, bucket S3 de Terraform, ARN de `LabRole`, roles EKS, nome do cluster, VPC própria após o primeiro módulo, repositórios ECR, endpoint RDS, DNS ALB/NLB, hostname público exclusivo, certificado ACM e nome da zona DNS. A região de referência é `us-east-1`; o hostname `www.asdocs.abrdns.com` pertence à **conta principal**.

Use [GUIA_AJUSTES_MANUAIS_POR_CONTA.md](GUIA_AJUSTES_MANUAIS_POR_CONTA.md) como lista de arquivos a adaptar: backends S3, `allowed_account_ids`, `terraform.tfvars`, comparações fixas de VPC/conta, roles, ECR, ACM, DNS, `APP_URL`, `PUBLIC_APP_URL` e configurações de backend/IA. Rodar `scripts/auditar-reproducao.ps1` antes de provisionar. Não substituir identificadores indiscriminadamente em arquivos históricos nem copiar state de outra conta.

**Pontos adicionais da versão OAuth2/TLS de 24/11/2026:**

| Item | O que adaptar na sua conta |
|---|---|
| `As-docs-ai/deploy/k8s/10-ai-config.yaml` | `AI_OIDC_ISSUER`, `AI_OIDC_JWKS_URL`, `AI_OAUTH_CLIENTS_JSON` com `sub` real de cada cliente; conferir `AI_OAUTH_ENABLED`. Nunca copiar `sub` da conta principal. |
| `As-docs-app/deploy/k8s/20-backend-config.yaml` | `APP_URL`, `OIDC_ISSUER` quando presente, `DOCS_AI_URL` e `DOCS_AI_OAUTH_ENABLED`. O nome DNS interno pode permanecer se cluster/namespace/service forem iguais. |
| `As-docs-ai/deploy/k8s/20-ai.yaml` | Imagem ECR da sua conta, incluindo tag realmente publicada; manter Caddy + portas/volumes. |
| `As-docs-app/deploy/k8s/22-backend.yaml` | Imagem ECR da sua conta, CA montada e `NODE_EXTRA_CA_CERTS`; não remover PVC/Service/NetworkPolicy sem avaliar dependências. |
| `As-docs-app/deploy/k8s/21-internal-ca.yaml` | **Não aplicar a CA pública da conta principal** na sua instalação. Substituir pelo certificado público da nova CA ou criar o ConfigMap diretamente a partir do seu `ca.crt`. |
| `As-docs-ai/deploy/k8s/12-ai-caddy.yaml` | Conferir hostname TLS interno, volumes e caminho do certificado; em geral o DNS do Service é igual em clusters independentes. |
| `infra/edge` e frontend | Keycloak, host público, certificado ACM, imagens ECR, `/opt/as-docs/frontend.env`, listeners e WAF específicos da conta. |

## 3. Provisionar a infraestrutura na ordem correta

Seguir **sem pular as validações** o [GUIA_REPRODUCAO_AWS.md](GUIA_REPRODUCAO_AWS.md):

1. S3 privado/criptografado/versionado para Terraform state, com nome de bucket exclusivo da conta.
2. `infra/terraform`: VPC, sub-redes, EKS, nodes e EBS CSI; revisar `terraform init`, `validate`, **`plan`**, e só então `apply`. Conferir IP público `/32` de acesso à API do EKS. Aplicar `storage-gp3.yaml` quando indicado pelo guia.
3. `infra/database`: RDS PostgreSQL e arquivos de configuração locais (incluindo segredo) da **própria conta**. Verificar state remoto correto.
4. `infra/edge`: borda, duas EC2 frontend, NLB, ALB e WAF. Primeiro TLS público pode ainda não estar disponível; prosseguir com DNS/ACM antes de validar acesso HTTPS definitivo.
5. Criar repositórios ECR e publicar imagens compatíveis dos dois repositórios na sua conta. Adaptar `image:` em **todos** os Deployments antes de aplicar. Preferir tag imutável.

**Nunca aplicar `terraform destroy` ou reaplicar indiscriminadamente um state de outro integrante.** Cada módulo tem seu próprio state e usa o bucket da conta destino.

## 4. DNS público, HTTPS e Keycloak

1. Escolher hostname exclusivo controlado pelo integrante; criar o registro de aplicação para o ALB próprio.
2. Solicitar **ACM na mesma região/conta do ALB** e adicionar o CNAME de validação DNS. Só configurar o listener TLS da borda com o certificado **ISSUED**.
3. Configurar `tls.auto.tfvars` localmente na borda, revisar `terraform plan` e aplicar o listener HTTPS conforme o guia multiconta.
4. O issuer esperado em cada instalação é `https://<HOSTNAME_EXCLUSIVO>/id/realms/as-docs`, e o JWKS é `<ISSUER>/protocol/openid-connect/certs`. Implantar/configurar Keycloak de acordo com `infra/edge/KEYCLOAK.md`, `infra/edge/keycloak.tf`, `infra/edge/apply-keycloak.sh` e os templates de borda da mesma versão do código. Confirmar acesso ao realm **`as-docs`** pelo hostname próprio e ao JWKS.
5. Criar/configurar na **nova instância Keycloak**, conforme o código e os testes do projeto, os clientes de serviço confidenciais `docs-app-indexer` e `docs-app-assistant`, com client credentials e as permissões necessárias:
   - Indexer: `ai:index:write`, `ai:index:read`.
   - Assistant: `ai:chat:invoke`, `ai:writing:invoke`.
   - Audience esperada pela IA: `docs-ai`.
6. Obter os secrets **da nova conta** e os `sub` reais dos tokens dos dois clientes. Preencher `OIDC_CLIENT_SECRET_INDEXER`, `OIDC_CLIENT_SECRET_ASSISTANT` no Secret Kubernetes do backend, e `AI_OAUTH_CLIENTS_JSON` no ConfigMap da IA. Verificar `iss`, `aud`, `azp`, `sub` e scopes sem imprimir o token nem secrets em logs.

**Atenção:** OAuth2 **backend ↔ IA** foi validado na conta principal. Isso não comprova login OIDC de usuários finais no frontend; o seletor Usuário 1/Usuário 2 ainda é modo de demonstração. Não apresentar esses dois conceitos como equivalentes.

## 5. Gerar TLS interno exclusivo desta conta

O ALB usa certificado ACM. **O Caddy interno usa outro certificado**, com SAN `as-docs-ai.as-docs.svc.cluster.local`, assinado por uma CA privada **da nova conta**, cujos arquivos não podem ir para o Git.

Com OpenSSL disponível, trabalhar numa pasta protegida FORA dos dois repositórios:

```powershell
$certDir = Join-Path $env:LOCALAPPDATA 'as-docs\internal-tls'
New-Item -ItemType Directory -Force -Path $certDir | Out-Null
Set-Location $certDir

openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 365 -keyout ca.key -out ca.crt -subj '/CN=As-docs internal CA' -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign'
openssl req -new -newkey rsa:3072 -sha256 -nodes -keyout server.key -out server.csr -subj '/CN=as-docs-ai.as-docs.svc.cluster.local'
@'
subjectAltName=DNS:as-docs-ai.as-docs.svc.cluster.local
extendedKeyUsage=serverAuth
basicConstraints=CA:FALSE
'@ | Set-Content .\server.ext -Encoding ascii
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 90 -sha256 -extfile .\server.ext
openssl verify -CAfile .\ca.crt .\server.crt
```

Conferir os retornos de todos os comandos OpenSSL antes de continuar. Com `kubectl` apontando **para o EKS da conta correta** e namespace já criado:

```powershell
kubectl -n as-docs create secret tls as-docs-ai-tls --cert=.\server.crt --key=.\server.key --dry-run=client -o yaml | kubectl apply -f -
kubectl -n as-docs create configmap as-docs-internal-ca --from-file=ca.crt=.\ca.crt --dry-run=client -o yaml | kubectl apply -f -
```

**Não executar em seguida `kubectl apply -f .../21-internal-ca.yaml` usando o certificado da conta principal**, pois substituiria a nova CA por uma incompatível. Para essa conta, gere/adapte uma cópia segura desse manifesto com **seu** certificado público. Guarde CA privada e certificado/PK do servidor em backup protegido; a CA privada não é um Secret Kubernetes necessário à execução normal, mas será necessária para renovar certificados sem trocar a CA.

## 6. Deploy de Redis, backend, IA e frontend

1. Conferir `aws eks update-kubeconfig --region us-east-1 --name as-docs-eks --profile estudante` e `kubectl config current-context` antes de aplicar recursos.
2. Aplicar namespace, StorageClass, Redis e respectivas NetworkPolicies conforme os guias existentes. Criar os Secrets reais de backend/IA a partir de configuração local protegida (os `.example.yaml` são **modelos, não credenciais válidas**).
3. Confirmar que Keycloak, certificados, ConfigMaps da CA e Caddy estão prontos **antes** dos Deployments que os referenciam. No repositório da IA, aplicar `10-ai-config.yaml` **adaptado**, `12-ai-caddy.yaml` e `20-ai.yaml`; no backend, aplicar `20-backend-config.yaml` **adaptado**, sua CA pública e `22-backend.yaml`. A ordem geral é: ConfigMaps/Secrets → Deployments/Services/NetworkPolicies → rollout/saúde.
4. **Não aplicar cegamente manifests da conta principal:** `AI_OAUTH_ENABLED=true` e `DOCS_AI_OAUTH_ENABLED=true` exigem Keycloak e clientes já funcionais. Para inicialização em etapas, ambos os lados precisam usar **o mesmo modo** (`false/false` para HTTPS + HMAC provisório, ou `true/true` para OAuth2). Ativar OAuth2 somente após os tokens estarem válidos.
5. Validar que a IA oferece somente `8443/TCP` no Service; o backend deve apontar para `https://as-docs-ai.as-docs.svc.cluster.local:8443`, confiar na CA interna e montar `NODE_EXTRA_CA_CERTS`.
6. Publicar o frontend em **cada uma das duas EC2** via SSM, com a imagem ECR da conta. Criar em cada host o arquivo privado `/opt/as-docs/frontend.env` com `BACKEND_URL` para o NLB interno e `PUBLIC_APP_URL` para o hostname HTTPS próprio. Recriar o container ao mudar esse arquivo; `docker restart` não atualiza variáveis de um container existente.

**Limitação ainda aberta para instalação totalmente independente:** o comando exato de primeiro `docker run`/SSM do frontend deve ser conferido no procedimento operacional da imagem e testado na segunda conta. **Não inventar o mapeamento de portas** nem copiar IDs de instância da conta principal. O conteúdo de `infra/edge/KEYCLOAK.md` também deve ser validado especificamente com os clients OAuth2, não apenas com o processo de subida do Keycloak.

## 7. Teste de aceite por conta

```powershell
aws sts get-caller-identity --profile estudante
kubectl get nodes -L topology.kubernetes.io/zone
kubectl -n as-docs get pods,pvc,svc,deploy
kubectl -n as-docs rollout status deployment/as-docs-ai --timeout=180s
kubectl -n as-docs rollout status deployment/as-docs-backend --timeout=180s
```

Verificar com o **hostname da própria conta** (sem `-k`): HTTPS 200, `/api/health/live` HTTP 200, redirect HTTP→HTTPS, E2E `scripts/tcc-e2e.py`, persistência após F5, colaboração entre duas janelas, indexação de página nova e chat com fonte. Confirmar também no backend→IA `GET /health/ready` HTTP 200 por HTTPS e autorização OAuth2 com credenciais da própria conta (401 sem token, 403 sem escopo, 200 no caso permitido). Confirmar a configuração real de permissão de escrita assistida, se for utilizada na apresentação.

**Critério final:** uma conta adicional só deve ser anunciada como reserva depois que **ela própria** passar os testes. Sucesso na conta principal não valida automaticamente as outras.

## 8. Próxima sessão, sem reconstruir a infraestrutura

Se os recursos já existem e somente o laboratório parou, **não** seguir este guia de primeiro deploy outra vez. Usar [GUIA_RETOMADA_LAB_AWS_ACADEMY.md](GUIA_RETOMADA_LAB_AWS_ACADEMY.md).
