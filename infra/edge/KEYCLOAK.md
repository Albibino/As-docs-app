# Keycloak no EKS (AWS Academy)

O state `edge.tfstate` reaproveita o EKS privado, o ALB/WAF e o RDS. Com `keycloak_enabled = true`, o Terraform aplica o Deployment, Service e ConfigMap no EKS via `kubectl`, aguarda o rollout e publica `https://<domínio>/id/realms/as-docs`. A licença do laboratório não é usada para criar nova função IAM nem outro balanceador/RDS. O Keycloak roda com uma réplica (não é HA); a persistência fica no RDS, em banco e usuário exclusivos. A porta 9000 de gestão não tem rota pública e a borda só encaminha o realm `as-docs` e os recursos estáticos.

## Pré-requisitos

- Sessão válida na conta e região já configuradas na borda, acesso ao state S3 e permissão de deploy no EKS. Use o [preflight da borda](README.md), além de conferir se o NodePort `30443` está livre ou já pertence a `as-docs-identity/as-docs-keycloak`.
- Domínio confirmado apontando para o DNS do ALB e certificado ACM `ISSUED` para o domínio. O Keycloak não aceita o modo provisório HTTP.
- No RDS privado existente: crie a role de login `keycloak` sem privilégios de administração e o banco `keycloak` pertencente a essa role. Use `\password keycloak` no `psql` para definir a senha sem escrevê-la no SQL, e não reutilize a senha do app. Valide o acesso com TLS no cliente e use o bundle oficial do Amazon RDS para a região.
- No contexto AWS `arn:aws:eks:us-east-1:362749056012:cluster/as-docs-eks`, crie o namespace `as-docs-identity` e os objetos abaixo a partir de fontes protegidas. Não use valores literais na linha de comando nem faça commit dos arquivos. O Terraform recebe só nomes, configuração pública e referências aos Secrets.

| Objeto no namespace `as-docs-identity` | Conteúdo |
|---|---|
| Secret `as-docs-keycloak-db` | Chave `password` da role `keycloak` no RDS |
| Secret TLS `as-docs-keycloak-tls` | `tls.crt` e `tls.key` exclusivos do pod; inclua no certificado o nome usado para administração privada, por exemplo `localhost` |
| Secret `as-docs-keycloak-bootstrap` | `username` e `password` temporários para inicializar um banco vazio; retire após provisionar o acesso administrativo permanente e reiniciar o Deployment |
| ConfigMap `as-docs-keycloak-rds-ca` | Chave `ca.pem` com o bundle do RDS |

O navegador valida o ACM, o ALB cifra novamente até a porta 8443, e o Keycloak valida certificado e hostname do RDS (`verify-full`). O ALB não valida o certificado do destino: esse trecho depende dos SGs e da rede privada. O WAF bloqueia cabeçalhos de proxy fornecidos pelo cliente no caminho `/id/`; não coloque outro proxy que envie esses cabeçalhos antes do ALB sem revisar essa política.

## Aplicar e verificar

1. Em `infra/edge`, carregue `cloudshell-env.sh` e execute `terraform init` com o state S3 existente. Configure `public_hostname`, `acm_certificate_arn`, `keycloak_enabled = true` e `keycloak_db_host` em seu `*.auto.tfvars` ignorado. Use o `host` de `database_connection` do state `infra/database`, sem porta. Se já há `tls.auto.tfvars`, mantenha nele os dois valores TLS em vez de duplicá-los.
2. Execute `terraform validate`, `terraform test` e `terraform plan -out=keycloak.tfplan`. Revise se o plano não substitui nem remove recursos da base existente. Aplique com `terraform apply keycloak.tfplan` só após a revisão. Se for o primeiro apply de HTTPS, a mudança de HTTP para redirecionamento também afeta o frontend.
3. Confira o Deployment com `kubectl --context arn:aws:eks:us-east-1:362749056012:cluster/as-docs-eks -n as-docs-identity rollout status deployment/as-docs-keycloak`. Consulte `terraform output -raw keycloak_target_group_arn` e confirme ao menos um alvo saudável em `aws elbv2 describe-target-health`. Com uma réplica e `externalTrafficPolicy: Local`, os outros nós não servem o Keycloak e não precisam ficar saudáveis no target group.
4. Defina `issuer=$(terraform output -raw keycloak_issuer)`. Acesse `$issuer/.well-known/openid-configuration` e confirme que `issuer` é idêntico e que `jwks_uri` devolve chaves. Confira `404` em `/id/admin/`, `/id/realms/master/.well-known/openid-configuration` e `/id/health/ready`. Confira que a descoberta normal retorna `200` e a mesma consulta com um `X-Forwarded-Host` fornecido pelo cliente é bloqueada.
5. Administre por `kubectl ... port-forward service/as-docs-keycloak 18443:8443` e use `kcadm` apontando para `https://localhost:18443/id`, com truststore do certificado do pod. O console e o realm `master` não são públicos. Emita uma credencial técnica e confirme `iss`, `aud=docs-ai`, `sub` e o escopo sem imprimir o token. Crie somente as duas contas de usuário autorizadas se for conectar o app.

## Conectar o app e a IA (corte separado)

No backend, use `APP_URL=https://<domínio>`, `OIDC_ISSUER=<keycloak_issuer>` e o secret do cliente `docs-app-web`. Configure os dois vínculos `(iss, sub)` no banco do app antes de `OIDC_ENABLED=true`; o helper local `scripts/tcc-link-oidc.sh` fixa o issuer de localhost e não deve ser usado no RDS. Use como callback exatamente `https://<domínio>/api/auth/oidc/callback`. Sem URL de backchannel, o backend usa a origem pública HTTPS e precisa alcançá-la nos pods.

O transporte OAuth backend → IA **não é ativado por este Terraform**. A configuração AWS atual usa HTTP interno para a IA; antes do corte, configure HTTPS confiável nesse trecho e o mesmo issuer/JWKS na IA. Depois vincule as contas técnicas ao workspace e habilite OAuth nos dois serviços juntos. Não desligue OIDC como fallback no app público.

## Atualizações e rollback

A importação inicial não atualiza realm existente. Use administração explícita para mudar clients, redirects ou contas em um banco persistido. O provisioner não detecta drift de objetos Kubernetes: para reaplicar o manifesto, revise um plano com `-replace='terraform_data.keycloak[0]'`. Em rollback, desative o recurso de borda com `keycloak_enabled=false` e revise o plano; o Deployment, ConfigMap, Secrets e banco ficam preservados. A remoção de objetos Kubernetes, se necessária, é separada. Não destrua a borda para reverter o servidor de identidade.
