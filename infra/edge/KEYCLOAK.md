# Keycloak no EKS (AWS Academy)

O state `edge.tfstate` reaproveita o EKS privado, o ALB/WAF e o RDS. Com `keycloak_enabled = true`, o Terraform aplica o Deployment, Service e ConfigMap no EKS via `kubectl`, aguarda o rollout e publica `https://<domínio>/id/realms/as-docs`. A licença do laboratório não é usada para criar nova função IAM nem outro balanceador/RDS. Na borda legada, o padrão continua sendo uma réplica. A persistência fica no RDS, em banco e usuário exclusivos. A porta 9000 de gestão não tem rota pública e a borda só encaminha o realm `as-docs` e os recursos estáticos.

O roteiro abaixo usa a implantação legada. Em `infra/lab`, use a raiz portátil
e prepare os mesmos pré-requisitos no banco e cluster dessa raiz antes de
ativar Keycloak. O provisionador usa a conta selecionada e o nome do cluster
fornecido pela rede; a sessão da CLI AWS no ambiente do Terraform também deve
ser dessa conta.

## Réplicas em nós distintos

Em `infra/lab`, quando o Keycloak está habilitado, o padrão é `keycloak_replicas = 2`.
São necessários pelo menos dois nós aptos, com recursos para um pod cada.
A antiafinidade exige nós diferentes e o agendamento prefere zonas distintas.
O cache Infinispan usa descoberta `jdbc-ping` no mesmo banco e mTLS entre
as réplicas. A política de ingress só permite TCP `7800` e `57800` entre pods
do Keycloak; as portas não fazem parte do Service exposto ao ALB.

Em um lab já provisionado, revise o plano no mesmo state, mantendo as flags
atuais. A primeira troca de cache local para distribuído pode interromper
logins em andamento. `keycloak_replicas = 1` mantém o modo de pod único.
Depois do apply, confira os nós com `kubectl -n as-docs-identity get pods
-l app=as-docs-keycloak -o wide` no contexto do lab e confira nos logs de ambos
uma visão do cluster com dois membros. Confira dois alvos saudáveis no ALB.
Em um ambiente de teste, remova um pod e confira login pelo ALB e emissão de
token técnico pelo backchannel privado. O rollout pronto não substitui esse teste.

## Pré-requisitos

- Sessão válida na conta e região já configuradas na borda, acesso ao state S3 e permissão de deploy no EKS. Use o [preflight da borda](README.md), além de conferir se o NodePort `30443` está livre ou já pertence a `as-docs-identity/as-docs-keycloak`.
- Domínio confirmado apontando para o DNS do ALB e certificado ACM `ISSUED` para o domínio. O Keycloak não aceita o modo provisório HTTP.
- No RDS privado existente: crie a role de login `keycloak` sem privilégios de administração e o banco `keycloak` pertencente a essa role. Use `\password keycloak` no `psql` para definir a senha sem escrevê-la no SQL, e não reutilize a senha do app. Valide o acesso com TLS no cliente e use o bundle oficial do Amazon RDS para a região.
- No contexto AWS `arn:aws:eks:us-east-1:967931808920:cluster/as-docs-eks`, crie o namespace `as-docs-identity` e os objetos abaixo a partir de fontes protegidas. Não use valores literais na linha de comando nem faça commit dos arquivos. O Terraform recebe só nomes, configuração pública e referências aos Secrets.

| Objeto no namespace `as-docs-identity` | Conteúdo |
|---|---|
| Secret `as-docs-keycloak-db` | Chave `password` da role `keycloak` no RDS |
| Secret TLS `as-docs-keycloak-tls` | `tls.crt` e `tls.key` exclusivos do pod; inclua no certificado o nome usado para administração privada, por exemplo `localhost` |
| Secret `as-docs-keycloak-bootstrap` | `username` e `password` temporários para inicializar um banco vazio; retire após provisionar o acesso administrativo permanente e reiniciar o Deployment |

O provisionador baixa o bundle público oficial do RDS de `us-east-1` com
`curl` e aplica o ConfigMap `as-docs-keycloak-rds-ca` (chave `ca.pem`) antes
do Deployment. Não crie esse ConfigMap manualmente nem emita um certificado
de cliente para o RDS.

O navegador valida o ACM, o ALB cifra novamente até a porta 8443, e o Keycloak valida certificado e hostname do RDS (`verify-full`). O ALB não valida o certificado do destino: esse trecho depende dos SGs e da rede privada. O WAF bloqueia cabeçalhos de proxy fornecidos pelo cliente no caminho `/id/`; não coloque outro proxy que envie esses cabeçalhos antes do ALB sem revisar essa política.

## Aplicar e verificar

1. Em `infra/edge`, carregue `cloudshell-env.sh` e execute `terraform init` com o state S3 existente. Configure `public_hostname`, `acm_certificate_arn`, `keycloak_enabled = true` e `keycloak_db_host` em seu `*.auto.tfvars` ignorado. Use o `host` de `database_connection` do state `infra/database`, sem porta. Se já há `tls.auto.tfvars`, mantenha nele os dois valores TLS em vez de duplicá-los.
2. Execute `terraform validate`, `terraform test` e `terraform plan -out=keycloak.tfplan`. Revise se o plano não substitui nem remove recursos da base existente. Aplique com `terraform apply keycloak.tfplan` só após a revisão. Se for o primeiro apply de HTTPS, a mudança de HTTP para redirecionamento também afeta o frontend.
3. Confira o Deployment com `kubectl --context arn:aws:eks:us-east-1:967931808920:cluster/as-docs-eks -n as-docs-identity rollout status deployment/as-docs-keycloak`. Consulte `terraform output -raw keycloak_target_group_arn` e confirme ao menos um alvo saudável em `aws elbv2 describe-target-health`. Com uma réplica e `externalTrafficPolicy: Local`, os outros nós não servem o Keycloak e não precisam ficar saudáveis no target group.
4. Defina `issuer=$(terraform output -raw keycloak_issuer)`. Acesse `$issuer/.well-known/openid-configuration` e confirme que `issuer` é idêntico e que `jwks_uri` devolve chaves. Confira `404` em `/id/admin/`, `/id/realms/master/.well-known/openid-configuration` e `/id/health/ready`. Confira que a descoberta normal retorna `200` e a mesma consulta com um `X-Forwarded-Host` fornecido pelo cliente é bloqueada.
5. Administre por `kubectl ... port-forward service/as-docs-keycloak 18443:8443` e use `kcadm` apontando para `https://localhost:18443/id`, com truststore do certificado do pod. O console e o realm `master` não são públicos. Emita uma credencial técnica e confirme `iss`, `aud=docs-ai`, `sub` e o escopo sem imprimir o token. Crie somente as duas contas de usuário autorizadas se for conectar o app.

## Conectar o app e a IA (corte separado)

No backend, use `APP_URL=https://<domínio>`, `OIDC_ISSUER=<keycloak_issuer>` e o secret do cliente `docs-app-web`. Configure os dois vínculos `(iss, sub)` no banco do app antes de `OIDC_ENABLED=true`; o helper local `scripts/tcc-link-oidc.sh` fixa o issuer de localhost e não deve ser usado no RDS. Use como callback exatamente `https://<domínio>/api/auth/oidc/callback`. Sem URL de backchannel, o backend usa a origem pública HTTPS e precisa alcançá-la nos pods.

O transporte OAuth backend → IA **não é ativado por este Terraform**. A configuração AWS atual usa HTTP interno para a IA; antes do corte, configure HTTPS confiável nesse trecho e o mesmo issuer/JWKS na IA. Depois vincule as contas técnicas ao workspace e habilite OAuth nos dois serviços juntos. Não desligue OIDC como fallback no app público.

## Atualizações e rollback

A importação inicial não atualiza realm existente. Use administração explícita para mudar clients, redirects ou contas em um banco persistido. O provisioner não detecta drift de objetos Kubernetes: para reaplicar o manifesto, revise um plano com `-replace='terraform_data.keycloak[0]'`. Em rollback, desative o recurso de borda com `keycloak_enabled=false` e revise o plano; o Deployment, ConfigMap, Secrets e banco ficam preservados. A remoção de objetos Kubernetes, se necessária, é separada. Não destrua a borda para reverter o servidor de identidade.

## Modo HTTP do Learner Lab

Somente para as duas contas descartáveis: `keycloak_enabled = true` e
`keycloak_lab_http = true` na raiz `infra/lab`, com `public_hostname` e
`acm_certificate_arn` vazios. Mantenha a URL exata de `public_app_url`. O
listener 80 serve somente a autorização web, `login-actions` e os recursos
estáticos do Keycloak; `/id/admin`, `master` e o endpoint de token não são
encaminhados. O navegador usa HTTP, mas Kubernetes, RDS e o backchannel do
backend continuam com as configurações TLS existentes. Não use contas reais
ou documentos sensíveis nesse modo.

1. Prepare os Secrets como no fluxo acima. O certificado TLS do
   pod deve cobrir `as-docs-keycloak.as-docs-identity.svc.cluster.local`.
   No namespace `as-docs`, crie o ConfigMap `as-docs-aws-lab-trust` com a chave
   `ca.pem` contendo a CA do Keycloak e a CA regional do RDS, não chaves
   privadas. Revise o plano e aplique usando o state de `infra/lab`.
2. Para um realm persistido, configure `sslRequired=none` no realm `as-docs`
   e configure o `docs-app-web` com a única URL de callback
   `<public_app_url>/api/auth/oidc/callback`, usando a API administrativa pelo
   port-forward HTTPS. Remova qualquer override `frontendUrl` que fixe o
   issuer anterior. A importação inicial não atualiza o realm persistido.
   Confirme cadastro fechado e vincule os dois `sub` às duas contas locais
   usando o issuer `<public_app_url>/id/realms/as-docs`. Não crie vínculos
   novos a cada tentativa, nem redefina segredos existentes como rotina.
3. Renderize com `OIDC_AWS_LAB_HTTP=true`, `PUBLIC_APP_URL` igual ao output e
   `BACKEND_IMAGE` por digest. Preserve `DATABASE_URL`, `APP_SECRET` e o PVC;
   `OIDC_CLIENT_SECRET_WEB` precisa corresponder ao cliente real do Keycloak.
   Use a mesma origem em `PUBLIC_APP_URL` nas duas EC2 e substitua o Nginx
   temporário que atende apenas as sondas pelo manifesto normal do frontend.
4. Valide `/healthz`, `/api/health/live`, `/login` e o callback usando as
   duas contas. Confirme que `POST /api/auth/select-user`, `/id/admin` e
   `/id/realms/as-docs/protocol/openid-connect/token` não são públicos.

Para desativar, volte ao modo HTTPS ou desative `keycloak_enabled` e
`keycloak_lab_http` juntos. Ao voltar para HTTPS com duas réplicas, mantenha
a NetworkPolicy `keycloak-http-lab-ingress`: ela também contém as regras do
cache. Se o manifesto deixar de incluir a política (por exemplo, em HTTPS
com uma réplica), revise e remova a política antiga separadamente; o
provisionador não remove manifests já aplicados.
