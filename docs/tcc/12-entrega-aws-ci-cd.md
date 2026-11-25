# Entrega AWS automatizada: o que reutilizar e o que falta

## O que veio da branch do Pedro Muci

A branch `feature/aws-academy-deploy` do app documenta o ambiente principal em `infra/GUIA_DEPLOY_AWS_MULTICONTA.md` (§§4–6), `infra/GUIA_PRIMEIRO_DEPLOY_AWS_ACADEMY.md` e `deploy/k8s/README-OAUTH-TLS.md`. O hostname histórico `www.asdocs.abrdns.com` aponta para o ALB do grupo; não o altere para publicar outro laboratório. Reutilize o procedimento ClouDNS + ACM, o contrato ECR, a publicação sequencial por SSM e a porta 30300, não os IDs de conta, estado, certificados, CAs ou tags `latest` do guia.

A branch de mesmo nome do As-docs-ai tem o sidecar Caddy e o Service HTTPS na porta 8443, além da CI Python. Para reproduzir a integração completa, porte em conjunto a configuração de TLS e Client Credentials dos dois repositórios. Gere outra CA e certificados internos para o laboratório; não copie a CA nem a chave da implantação principal. A chave OpenAI já aprovada do projeto é um insumo externo; informe apenas a referência a um Secret autorizado. Não crie fallback para HMAC se o modo OAuth estiver ativo.

A CI do app foi adaptada de `9c7747c` e inclui as correções de fixture de `2df14ae` e `c4d92a2`. Valida build, testes e lint em PR para `main` e push na `main`. A CI da IA é reaproveitável separadamente, mas não foi integrada nesta árvore. CI e o workflow histórico `release.yml` não fazem rollout deste laboratório.

## Decisões de ambiente

O ALB já recebe um DNS da AWS, suficiente para verificar a saúde por HTTP sem configurar domínio ou certificado. Essa verificação separa falha de deploy de configuração de acesso público; não use HTTP para validar login ou expor o seletor legado. DNS customizado e ACM não resolvem o 502 dos destinos sem aplicação.

1. **HTTPS diretamente no ALB (se for o caminho escolhido):** usar um hostname exclusivo em uma zona autorizada. Route 53 é uma opção inteiramente na AWS; ClouDNS foi a escolha do grupo, não um requisito. Automatizar o apontamento para o ALB e, separadamente, a validação do ACM; aguardar `ISSUED` e informar ao `infra/lab` o ARN do certificado da conta em `us-east-1`.
2. **Registro:** preferir ECR da conta do laboratório, confirmando criação e push para o publicador e pull pelos nós EKS e perfis das EC2. Sem permissões, usar um registro já autorizado com o mesmo contrato. Registrar os digests do frontend, backend e IA junto aos SHAs de origem.
3. **Executor do CD:** preferir uma role de deploy dedicada assumida via OIDC do GitHub, se o administrador puder configurar a confiança para o repositório e ambiente aprovados. Também precisa de acesso ao EKS, incluindo conectividade, e a SSM. Se o Learner Lab impedir essa role, usar runner de deploy dedicado e com acesso de rede, com sessão AWS temporária válida. CI de PR continua em runner hospedado e sem credenciais AWS. Quando a sessão expirar ou o lab estiver desligado, o deploy para até o operador renovar a sessão ou reabrir o lab. Não abrir a API EKS para todo o mundo.

## O que implementar depois de definir o ambiente

- Primeiro deploy idempotente: conferir conta/state por STS; preparar DNS, ACM e registro; provisionar banco e Secrets; configurar o Keycloak e os vínculos; implantar Redis, backend e IA; publicar as duas EC2 via SSM. Manter as duas contas descartáveis do lab com senha igual ao login, cadastro fechado e administração privada. Não aplicar a regra de senha do lab a credenciais do banco, administração ou clientes técnicos. Recomenda-se limitar o acesso dos navegadores ao grupo que vai testar.
- A cada merge na `main`, depois do CI: produzir os artefatos da revisão, publicar por digest e usar o mesmo procedimento de rollout, uma EC2 por vez. Tratar a IA como um artefato de um segundo repositório: promover um digest conhecido e compatível, não usar `latest` nem assumir que a `main` do app atualiza a IA.
- Considerar entrega concluída somente após validar HTTPS, ambos os target groups, login dos dois usuários, edição/indexação/chat, e uma segunda execução que não recrie contas, bancos ou volumes. Guardar o último conjunto saudável de digests para reverter os workloads.

A raiz `infra/lab` continua responsável pelo state do laboratório. Não migrar para os states S3 usados no roteiro do grupo nem rodar Terraform automaticamente a cada alteração de código.

## Validação inicial no Learner Lab

As imagens de verificação do app foram publicadas em dois repositórios ECR
privados com tags imutáveis; foram validados o pull nas EC2 e o pull do backend
no EKS. O Redis ficou `Ready` com PVC `gp3` vinculado. Um pod descartável
confirmou TCP para o RDS e foi removido; isso não valida autenticação SQL.

Enquanto o ALB tiver apenas HTTP, `deploy/ec2/lab-health.conf.template` deve ser
usado somente como configuração temporária do frontend: permite sondar as duas
rotas de saúde e não publica SPA, login ou dados. As duas EC2 ficaram `healthy`
e o ALB entregou `/healthz` com `200`. Os repositórios ECR criados fora do
Terraform não são removidos pelo `terraform destroy` do laboratório.

A senha administrativa do RDS foi redefinida na instância existente após a
renovação da sessão do Learner Lab. A autenticação de `asdocs_admin` no banco
`asdocs` foi validada a partir do EKS com `sslmode=verify-full`. O backend usa
o usuário dedicado `asdocs_app`, com permissão para migrar os próprios objetos
no schema `public`, sem `CREATE` no banco nem `rds_superuser`. O administrador
pré-instalou `unaccent`, `pg_trgm` e `pgcrypto` no banco `asdocs`, para que as
migrações possam executar sem elevar os privilégios do backend.

O backend ficou `1/1`, com volume `gp3` e Service NodePort `30300`. Todos os
targets do NLB ficaram saudáveis; `/healthz` e `/api/health/live` retornaram
`200` pelo ALB. O modo de diagnóstico mantém o seletor desabilitado, usa um
issuer reservado sem provedor real e não publica SPA, login, IA ou MCP.
Antes de publicar o app, substitua esse modo pela configuração real de OIDC
com HTTPS, preservando o Secret do banco, o `APP_SECRET`, a CA do RDS e o PVC.

## Keycloak e IA em rede privada

O Keycloak está implantado como ClusterIP em `as-docs-identity`, com banco
`keycloak` separado no RDS e acesso de teste via port-forward em loopback.
O issuer temporário é `https://localhost:18443/id/realms/as-docs`; as duas
contas descartáveis emitiram códigos OIDC após autenticação com PKCE. Isso
não valida o callback do app. Não crie vínculos com o issuer temporário para
um deploy público. Ao migrar para a origem definitiva, ajuste os redirects
do realm persistido pela API administrativa, vincule os dois `sub` ao issuer
definitivo e teste a sessão do app. O ALB HTTP continua sem rota do Keycloak.

A imagem de `As-docs-ai` da revisão `2def2f549da2ac315d0ae35a34e3fd5639adb425`
está no ECR e roda com duas réplicas em ClusterIP. A sonda feita do backend
confirmou o HTTPS interno via Caddy e `/health/ready`; uma requisição sem
credencial a `/v1/embeddings` retornou `401`. O ambiente temporário usa
`hashing`/`extractive` em um índice de diagnóstico separado, com MCP desligado.
O app ainda não chama esse serviço. Para concluir, configure um Secret de API
OpenAI autorizado, a confiança TLS e o OAuth2 técnico em ambos os lados e
valide indexação, chat e escrita assistida. O login do Hermes/Codex não é
uma chave OpenAI do serviço de IA.

## Login HTTP publicado no Learner Lab

O backend com a exceção HTTP foi publicado no ECR e implantado no EKS. O ALB
usa o DNS padrão como origem, encaminha apenas as rotas web do Keycloak e
mantém a troca de código em HTTPS privado. O realm persistido e os dois
vínculos foram atualizados. O frontend completo roda nas duas EC2; os
containers de diagnóstico ficaram parados para permitir retorno controlado.

Foram verificados o login, o callback e a identidade da sessão para as duas
contas pelo ALB, além de `/login`, `/healthz` e `/api/health/live` com `200`.
O seletor legado retornou `410`; a administração, o endpoint de token e
`/mcp` continuam privados. A integração da IA e o CD seguem separados.

Ao abrir uma página editável no laboratório HTTP, o editor não deve depender
de `crypto.randomUUID()` para montar o painel de escrita assistida. O frontend
usa a biblioteca `uuid` já instalada para criar os identificadores. A correção
não muda TLS, autenticação nem o requisito de contexto seguro de outras APIs
do navegador, como `crypto.subtle`.
