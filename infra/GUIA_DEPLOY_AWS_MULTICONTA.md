
# As-docs — guia principal de implantação multiconta

**Revisão:** 24/11/2026 (v3) · **Plataforma:** AWS Academy Learner Lab, região `us-east-1` · **Público:** equipe de quatro integrantes.

> **Escopo:** esta é a entrada para implantar a **aplicação completa** (backend, frontend, IA, HTTPS e testes). Os comandos oficiais dos três módulos de infraestrutura estão em [`GUIA_REPRODUCAO_AWS.md`](GUIA_REPRODUCAO_AWS.md); as substituições precisas por conta estão em [`GUIA_AJUSTES_MANUAIS_POR_CONTA.md`](GUIA_AJUSTES_MANUAIS_POR_CONTA.md). O script [`../scripts/auditar-reproducao.ps1`](../scripts/auditar-reproducao.ps1) deve acompanhar os guias. Leia os três documentos como um conjunto. Os ZIPs iniciais do projeto não incluem necessariamente as correções locais aplicadas ao deploy real: **usar somente os commits revisados e acordados do `As-docs-app` e do `As-docs-ai`**.
>
> **Status:** ambiente principal comprovado em 24/11/2026 com HTTPS, API saudável, E2E 7/7, edição persistente e colaboração em tempo real. As três contas de reserva **não** foram validadas com a aplicação completa. Este guia não é um instalador automático.

## Índice

1. [O que cada integrante entrega](#1-o-que-cada-integrante-entrega)
2. [Preparar o terminal e reunir identificadores](#2-preparar-o-terminal-e-reunir-identificadores)
3. [Sequência única de implantação](#3-sequência-única-de-implantação)
4. [Aplicação no EKS e imagens ECR](#4-aplicação-no-eks-e-imagens-ecr)
5. [Frontend nas duas EC2](#5-frontend-nas-duas-ec2)
6. [DNS e HTTPS exclusivo](#6-dns-e-https-exclusivo)
7. [Testes de aceite](#7-testes-de-aceite)
8. [Retomar o laboratório existente](#8-retomar-o-laboratório-existente)
9. [Limitações, evidências e entrega](#9-limitações-evidências-e-entrega)

## 1. O que cada integrante entrega

Cada um terá **uma conta AWS Academy independente**: bucket/state S3, VPC, EKS, RDS, Redis, imagens ECR, EC2s, ALB/NLB, WAF, Secrets e certificado ACM próprios. Não há replicação de documentos entre as quatro contas nem troca automática de ambiente.

- **Principal já validado:** `https://www.asdocs.abrdns.com`, exclusivo da conta originalmente implantada.
- **Reservas 1, 2 e 3:** cada integrante escolhe um hostname próprio e **verifica sua disponibilidade antes de divulgar**. Não há URLs de reserva provisionadas neste guia. Exemplos de formatos possíveis: `www.<ZONA_DNS_PROPRIA>` ou `<HOST_EXCLUSIVO>.asdocs.abrdns.com` **somente com autorização do administrador da zona compartilhada**.
- O grupo pode escrever na apresentação: **"Se a aplicação principal estiver indisponível, utilize uma das URLs de reserva confirmadas abaixo."** Só listar reserva após HTTPS e E2E aprovados na conta correspondente.

`www` é apenas o nome do registro DNS; pode existir em zonas diferentes. `www.asdocs.abrdns.com` **não** pode servir simultaneamente como endereço de quatro ALBs independentes. Cada integrante pode gerenciar sua própria zona ClouDNS gratuita, se houver disponibilidade e o plano suportar os registros necessários, ou usar uma zona compartilhada autorizada.

## 2. Preparar o terminal e reunir identificadores

Abrir **PowerShell na raiz da cópia local do `As-docs-app`**, independentemente de letra de disco. Depois de estar nessa pasta:

```powershell
$APP_ROOT = (Get-Location).Path
$env:AWS_PROFILE = 'estudante'
$env:AWS_DEFAULT_REGION = 'us-east-1'
aws sts get-caller-identity --profile estudante
aws iam list-roles --profile estudante --query "Roles[?contains(RoleName, 'LabEks') || RoleName=='LabRole'].[RoleName,Arn]" --output table
aws iam get-instance-profile --instance-profile-name LabInstanceProfile --profile estudante --query 'InstanceProfile.Roles[].Arn' --output text
```

Credenciais temporárias vêm de **AWS Details → AWS CLI** do laboratório, nunca do Git. Se houver `ExpiredToken`, renovar acesso antes de executar Terraform. No checklist de ajustes, preencher `<CONTA_DESTINO>`, `<ROLE_EKS_CLUSTER>`, `<ROLE_EKS_NODE>` e `<ARN_LABROLE>` antes do provisionamento. Não presumir que ARNs são obtidos só pela troca de 12 dígitos: nomes e sufixos das roles podem variar.

**Convenção dos exemplos:** comandos `Set-Location (Join-Path $APP_ROOT '...')` são executados após definir `$APP_ROOT`. Campos entre `<...>` são **instruções de preenchimento, não valores literais para aplicar**. Nunca copiar a conta, VPC, DNS, certificado ou credenciais de outro integrante.

## 3. Sequência única de implantação

**Fonte de verdade para comandos Terraform:** seguir exatamente as **seções 3 a 6** de [`GUIA_REPRODUCAO_AWS.md`](GUIA_REPRODUCAO_AWS.md). Evitar copiar blocos similares de outros documentos. A sequência e os pontos de parada são:

| Ordem | Etapa | Antes de começar | Resultado a guardar |
|---|---|---|---|
| 1 | Bucket S3 privado, versionado e criptografado | Conta AWS verificada | `<BUCKET_STATE>` da própria conta |
| 2 | `infra/terraform` (VPC, EKS e volumes) | Bucket + roles EKS + IP de API + adaptações no código | `<VPC_DESTINO>`, `as-docs-eks`, nodes `Ready`, StorageClass `gp3` |
| 3 | `infra/database` (RDS PostgreSQL) | State de rede correto e `<VPC_DESTINO>` obtida | Endpoint e credenciais privadas do RDS |
| 4 | `infra/edge` (duas EC2, ALB/NLB, WAF) | Rede, nodegroup e roles funcionando | DNS do ALB, URL do NLB, IDs das duas EC2 |

**Não executar** os helpers históricos `infra/state-backend/bootstrap` e `infra/state-backend/migracao`. Cada módulo usa um state S3 próprio (mesmo bucket de **sua** conta, chaves diferentes). Examinar sempre `terraform plan`: não aceitar exclusões/substituições inesperadas. `terraform test` na borda tem o comando no guia de infraestrutura; número de recursos/testes de um laboratório não é uma garantia universal.

Arquivo `infra/terraform/eks-acesso.auto.tfvars`: gerado **localmente**, deve conter o IP público da máquina que vai acessar EKS, e **não** deve ser versionado. Após `terraform/edge`, validar os Target Groups e só depois seguir com aplicação.

## 4. Aplicação no EKS e imagens ECR

Os arquivos indicados neste bloco pertencem à **versão consolidada** dos dois repositórios. Se o clone ainda tiver `ghcr.io` para o backend/IA, Service backend do tipo `LoadBalancer` ou Nginx com `default $fwd_proto;`, **pare** e obtenha o commit corrigido. No ambiente comprovado, o backend tem Service `NodePort` **30300**, o NLB é provisionado pela borda, e o Nginx preserva `X-Forwarded-Proto` do ALB.

### ECR na conta destino

```powershell
Set-Location $APP_ROOT
$ACCOUNT = (aws sts get-caller-identity --profile estudante --query Account --output text).Trim()
$REGISTRY = "$ACCOUNT.dkr.ecr.us-east-1.amazonaws.com"
foreach ($repo in @('as-docs-frontend','as-docs-backend','as-docs-ai')) {
    aws ecr describe-repositories --repository-names $repo --region us-east-1 --profile estudante *> $null
    if ($LASTEXITCODE -ne 0) {
        # Confirmar que a causa foi RepositoryNotFoundException, não AccessDenied.
        Write-Host "Verifique/crie manualmente o repositório ECR: $repo"
    }
}
aws ecr get-login-password --region us-east-1 --profile estudante | docker login --username AWS --password-stdin $REGISTRY
```

Criar os repositórios ECR ausentes **após confirmar** que a falha é repositório inexistente:

```powershell
aws ecr create-repository --repository-name as-docs-frontend --region us-east-1 --profile estudante
# Repetir para as-docs-backend e as-docs-ai se estiverem ausentes.
```

### Imagens backend, frontend e IA

```powershell
Set-Location $APP_ROOT
docker build --platform linux/amd64 -f .\backend\Dockerfile -t as-docs-backend:latest .
docker tag as-docs-backend:latest "$REGISTRY/as-docs-backend:latest"
docker push "$REGISTRY/as-docs-backend:latest"

docker build --platform linux/amd64 -f .\frontend\Dockerfile -t as-docs-frontend:latest .
docker tag as-docs-frontend:latest "$REGISTRY/as-docs-frontend:latest"
docker push "$REGISTRY/as-docs-frontend:latest"
```

Na raiz do **outro repositório** `As-docs-ai` (escolher seu caminho local e depois voltar para `$APP_ROOT`):

```powershell
# Execute estes 3 comandos APÓS entrar na raiz do As-docs-ai:
docker build --platform linux/amd64 -t as-docs-ai:latest .
docker tag as-docs-ai:latest "$REGISTRY/as-docs-ai:latest"
docker push "$REGISTRY/as-docs-ai:latest"
```

### Kubernetes

1. Confirmar `kubectl config current-context` aponta para **seu EKS**.
2. No `As-docs-app`, corrigir o `image:` de `deploy/k8s/22-backend.yaml` para o ECR da sua conta, `APP_URL` em `20-backend-config.yaml` para o **seu hostname** quando o HTTPS estiver pronto, e confirmar NodePort `30300`.
3. No `As-docs-ai`, corrigir `image:` de `deploy/k8s/20-ai.yaml`, mantendo `ClusterIP`. Para replicar exatamente o modo comprovado: `AI_EMBEDDING_PROVIDER: "hashing"` e `AI_CHAT_PROVIDER: "extractive"` em `10-ai-config.yaml` (modo sem LLM externo).
4. Criar `as-docs-backend-secret` com `APP_SECRET`, `DOCS_AI_HMAC_SECRET` e `DATABASE_URL` **próprios** usando a estrutura do manifesto `.example.yaml`; criar `as-docs-ai-secret` com o **mesmo HMAC do backend dessa conta**. Nunca aplicar o exemplo com valores fictícios nem publicar YAML com Secrets. `DATABASE_URL` aponta para o RDS da própria conta com TLS (`sslmode=require`). Validar necessidade de migrations conforme código/backend antes do deploy.
5. Aplicar namespace, StorageClass, Redis, ConfigMap e Deployments de backend/IA, sem aplicar por engano Service `LoadBalancer` antigo; validar pods/PVC/saúde.

```powershell
Set-Location $APP_ROOT
kubectl apply -f .\deploy\k8s\00-namespace.yaml
kubectl apply -f .\deploy\k8s\10-redis.yaml
kubectl -n as-docs get pods,pvc
kubectl apply -f .\deploy\k8s\20-backend-config.yaml
kubectl apply -f .\deploy\k8s\22-backend.yaml
kubectl -n as-docs rollout status deployment/as-docs-backend --timeout=180s
# No outro repositório, aplicar deploy/k8s/10-ai-config.yaml e deploy/k8s/20-ai.yaml
kubectl -n as-docs rollout status deployment/as-docs-ai --timeout=180s
```

**A ordem de configuração pode exigir secrets e migrations antes dos Deployments.** Esses passos devem ser completados com o runbook exato e testados numa conta adicional antes de classificar o guia como automatizado. Não reproduzir Secrets do ambiente principal.

## 5. Frontend nas duas EC2

A borda deve ter retornado os dois IDs de instância e o NLB interno. O backend deve responder antes de iniciar o frontend. Cada EC2 precisa da **imagem ECR da própria conta** e do arquivo **local** `/opt/as-docs/frontend.env`:

```dotenv
BACKEND_URL=http://DNS_DO_NLB_INTERNO:3000
PUBLIC_APP_URL=https://SEU_HOSTNAME_EXCLUSIVO
```

Valores em maiúsculas são **instruções**, não usar literalmente. Usar AWS Systems Manager (`AWS-RunShellScript`) para publicar a imagem e executar `docker run` nas duas instâncias, **uma por vez**, confirmando `curl -fsS http://127.0.0.1/healthz` e Target Group `healthy`. Não usar o domínio público na variável `BACKEND_URL`: ele aponta ao NLB privado HTTP.

Ao mudar `PUBLIC_APP_URL`, **recriar o container** com `--env-file /opt/as-docs/frontend.env`; `docker restart` sozinho não carrega o novo `.env`. Para o ambiente principal, a operação via SSM terminou `Success` nas duas EC2 e `/healthz` foi aprovado.

> **Pendente para reprodução completamente autônoma:** incorporar ao Git um roteiro SSM de *primeira instalação* já revisado, sem IDs ou credenciais fixas. Este guia não deve fazer o colega adivinhar a configuração inicial do container; por enquanto, esta é uma etapa assistida a validar antes da apresentação.

## 6. DNS e HTTPS exclusivo

**O domínio padrão já em uso é `www.asdocs.abrdns.com`, não o reutilize para outra conta.** Cada integrante pode criar uma zona ClouDNS própria disponível (ou receber um hostname da zona compartilhada). **CNAME da aplicação** e **CNAME de validação ACM** são registros diferentes:

1. Após criar ALB, obter seu DNS pelo output da borda.
2. Criar um CNAME do **hostname exclusivo da aplicação** apontando ao **seu ALB** (sem `https://`).
3. Solicitar certificado ACM `us-east-1` para **esse hostname**, na **sua conta AWS**.
4. Cadastrar **exatamente** o Name e Value do CNAME de validação mostrado pelo ACM no DNS autorizado; conferir a interpretação relativa/absoluta do campo Host no ClouDNS para não duplicar o sufixo da zona.
5. Aguardar `ISSUED`; sem isso, não ativar listener TLS.
6. Criar `infra/edge/tls.auto.tfvars` **local**, com `public_hostname` e `acm_certificate_arn` corretos. Conferir que o `.gitignore` ignora esse arquivo. Fazer `terraform validate` → `terraform plan` → conferir ausência de destruições → `terraform apply`.
7. Atualizar `APP_URL` no ConfigMap do backend e reiniciar seu Deployment; atualizar `PUBLIC_APP_URL` nas **duas EC2**, recriando containers como na seção 5.

Para não copiar hostnames fictícios, obtenha e preencha seu próprio domínio na variável `$HOSTNAME`:

```powershell
$HOSTNAME = Read-Host 'Hostname exclusivo (somente FQDN, sem https://)'
$CERT = aws acm request-certificate --domain-name $HOSTNAME --validation-method DNS --region us-east-1 --profile estudante --query CertificateArn --output text
aws acm describe-certificate --certificate-arn $CERT --region us-east-1 --profile estudante --query 'Certificate.DomainValidationOptions[].ResourceRecord' --output json
# Cadastrar o CNAME retornado no DNS, esperar Status = ISSUED.
```

O certificado ACM utilizado no ALB não é automaticamente compartilhado com as outras contas. O certificado principal e o DNS principal continuam associados ao ambiente principal.

**Nota técnica:** o `infra/edge/frontend.tf` apresentou warning do provider por declarar `default_action.target_group_arn` com ação `redirect`. A correção exige separar ações `forward` e `redirect` em blocos condicionais (por exemplo, `dynamic "default_action"` distintos); **não é bloqueante** no provider testado, mas deve ser revisada em PR, com `terraform validate/plan` antes de atualizar a AWS. Não corrigir às cegas na sessão de demonstração.

## 7. Testes de aceite

```powershell
Set-Location $APP_ROOT
$HOSTNAME = Read-Host 'Hostname em teste (sem https://)'
aws sts get-caller-identity --profile estudante
kubectl get nodes -L topology.kubernetes.io/zone
kubectl -n as-docs get pods,pvc,svc
curl.exe -I "https://$HOSTNAME/"
curl.exe -i "https://$HOSTNAME/api/health/live"
curl.exe -I "http://$HOSTNAME/"
# O script abaixo cria/edita páginas de demonstração reais:
python .\scripts\tcc-e2e.py "https://$HOSTNAME"
```

Aceitar **somente se**: HTTPS 200 sem `-k`, API `/api/health/live` 200, HTTP 301 para HTTPS; `E2E OK`; editor abre; nova página persiste após F5; Usuário 2 edita e Usuário 1 vê a alteração sem F5. Executar esses testes **em cada conta**, não presumir que todos herdam o sucesso da principal.

**Evidência principal 24/11/2026:** todos esses itens passaram na conta principal e no URL `https://www.asdocs.abrdns.com`. A IA passou no modo *hashing/extractive*: indexação v1, detecção de versão antiga via MCP, recuperação correta da v2 e reindexação. Isso **não** prova que uma API LLM generativa tenha sido utilizada.

## 8. Retomar o laboratório existente

O caso real após **End Lab** demonstrou duas EC2 `stopped` e Redis `Pending` temporário por incompatibilidade EBS/AZ até haver nó `Ready` na zona do volume. **Não utilizar `Reset Lab` para recuperar uma sessão.**

1. Executar `Start Lab` e renovar tokens temporários no perfil `estudante`.
2. Confirmar conta com `aws sts get-caller-identity`; atualizar contexto com `aws eks update-kubeconfig --region us-east-1 --name as-docs-eks --profile estudante`.
3. Investigar `kubectl get nodes -L topology.kubernetes.io/zone`, pods e PVC. Se Redis `Pending`, verificar zona do EBS, nodegroup/ASG e eventos antes de alterar escala; não apagar PVC.
4. Consultar EC2s **da sua conta**; iniciar somente as instâncias frontend `stopped` com `aws ec2 start-instances` e aguardar status `ok` + ALB targets `healthy`.
5. Executar novamente HTTPS e `/api/health/live`; repetir E2E quando apropriado.

**Não** reaplicar Terraform automaticamente em uma retomada. Evitar `terraform destroy`, `state push` e `Reset Lab` como procedimentos de recuperação.

## 9. Limitações, evidências e entrega

- HTTPS protege navegador ↔ ALB. O tráfego ALB → EC2 e segmentos internos usa HTTP na arquitetura atual; não apresentar isso como TLS ponta a ponta.
- O seletor de **Usuário 1 / Usuário 2** é modo de demonstração, não autenticação real. Confirmar trabalho Keycloak com o responsável antes de prometer OIDC completo.
- IA comprovada sem LLM externo (`hashing`/`extractive`). Segurança, WAF, segredos, SonarQube e CI/CD têm escopos próprios.
- Estados S3 e Secrets nunca são compartilhados entre contas. O laboratório pode consumir créditos e impor cotas diferentes.
- `terraform.tfvars` está rastreado no repositório principal; revisar antes de `git add`/`commit`/`push` e preferir valores de exemplo para código distribuído. Nunca versionar `.env`, senhas, tokens, states, `database-secrets.auto.tfvars.json` nem HMAC.
- A licença AGPL-3.0 do código deve ser respeitada; não tem relação com custo de certificado ACM.

### Checklist único para cada integrante

- [ ] Clones dos **dois repositórios** em commits acordados; ferramentas instaladas.
- [ ] AWS Academy ativo; conta, roles e LabInstanceProfile anotados.
- [ ] Trocas de `<CONTA_DESTINO>` feitas e auditadas; bucket S3 próprio.
- [ ] `infra/terraform` validado; nós `Ready`, VPC e StorageClass `gp3`.
- [ ] VPC própria substituída nas verificações; RDS criado; secrets próprios.
- [ ] `infra/edge` validado; IDs de EC2, DNS ALB e NLB registrados.
- [ ] Imagens ECR publicadas na conta; backend/Redis/IA em Kubernetes saudáveis.
- [ ] Frontend nas duas EC2 publicado com SSM; target groups `healthy`.
- [ ] DNS exclusivo, ACM `ISSUED` e Terraform HTTPS aprovados.
- [ ] `APP_URL` e `PUBLIC_APP_URL` apontam ao HTTPS exclusivo; backend/Nginx testados.
- [ ] HTTPS/API/redirect/E2E/F5/colaboração aprovados **nessa conta**.
- [ ] URL de reserva divulgada ao grupo somente após esses testes.

**Referências:** [ACM DNS validation](https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html) · [ALB HTTPS listeners](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/https-listener-certificates.html) · [ClouDNS](https://www.cloudns.net/landing/page/free-dns/).
