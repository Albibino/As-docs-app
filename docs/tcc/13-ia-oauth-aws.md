# IA com Client Credentials no laboratório AWS

O deploy opt-in `ai_oauth` em `infra/lab` usa o cluster, a conta e o issuer
que o próprio Terraform provisionou. Não reutiliza state, DNS, CA, credenciais
ou imagens privadas da conta de outro integrante. A IA fica em ClusterIP com
TLS e ingress restrito ao backend. O backend troca Client Credentials com o
Keycloak em HTTPS privado; a IA consulta o JWKS no mesmo Service. Nem o login
web nem a credencial delegada do MCP usam esses tokens técnicos.

## Primeiro deploy

1. Prepare a conta pelo [roteiro de `infra/lab`](../../infra/lab/README.md) e
   prepare os Secrets e habilite `app_deploy` conforme [deploy AWS](../../deploy/README.md).
   O mesmo `apply` pode executar `ai_oauth`: ele aguarda Redis, Keycloak e
   o backend com o seed do único workspace. A opção de HTTP público é exclusiva do
   Learner Lab descartável e não desativa TLS na comunicação técnica.
2. O realm novo já importa `docs-app-indexer` e `docs-app-assistant`, com as
   contas de serviço, escopos e audiência `docs-ai`. Se o realm já existir,
   confira os clientes na administração **privada**: a importação de startup
   não atualiza um banco persistido. O `apply` preserva o Secret técnico quando
   existe. Se estiver ausente e o bootstrap administrativo do Keycloak estiver
   disponível, valida os clientes no HTTPS privado e transfere as credenciais
   vigentes sem rotacionar. O pod e a política temporários são removidos ao
   final. Sem o bootstrap, prepare o Secret `as-docs/as-docs-backend-ai-oauth`
   com exatamente as chaves
   `OIDC_CLIENT_SECRET_INDEXER` e `OIDC_CLIENT_SECRET_ASSISTANT`. Não use
   segredos de outro ambiente. Use arquivo protegido (`0600`, fora do Git) e
   `kubectl --context "$CTX" -n as-docs create secret generic as-docs-backend-ai-oauth --from-env-file="$AI_CLIENT_SECRET_FILE"`
   após verificar a conta/contexto. Não passe valores literais no comando.
3. Nos modos HTTPS e HTTP, configure o ConfigMap `as-docs/as-docs-aws-lab-trust`
   (nome mantido por compatibilidade), chave `ca.pem`, com as CAs públicas do
   Keycloak e do RDS. O certificado do Keycloak deve ter SAN para
   `as-docs-keycloak.as-docs-identity.svc.cluster.local`. O script não pula
   verificação de certificado nem usa o ALB para trocar credenciais.
4. Para uso completo, copie `infra/lab/openai.tfvars.example` para
   `infra/lab/openai.auto.tfvars`, mantenha permissão `0600` e preencha
   `openai_api_key`. O `apply` cria o namespace se necessário e entrega a
   chave ao Secret `as-docs/as-docs-ai-openai` antes de executar `ai_oauth`.
   O valor não vai para o plano, state ou Git. Um Secret criado manualmente
   continua sendo aceito sem esse arquivo. Para trocar uma chave gerenciada
   pelo helper, altere o valor, incremente `openai_secret_revision` e aplique.
   Se a IA já estiver rodando, reinicie o Deployment para recarregar a chave.
   O modo `diagnostic`
   não precisa de chave, mas usa `hashing`/`extractive` e não valida escrita
   assistida. Use-o apenas com dados descartáveis: a troca posterior de
   provedor requer reconstruir o índice compatível com o novo provedor;
   o cursor do indexador não volta sozinho.
5. Publique as imagens compatíveis de ambos os repositórios e escolha o digest
   do Caddy já usado no deploy AWS. Confira acesso de pull no EKS. Mantenha os
   dois checkouts lado a lado (`As-docs-app` e `As-docs-ai`) ou aponte
   `TCC_DOCS_AI_PATH` para o checkout da IA no shell do Terraform. Acrescente
   `ai_oauth` a `infra/lab/ai.auto.tfvars` ou `infra/lab/terraform.tfvars`,
   seguindo `lab.tfvars.example`. Use o mesmo backend em `app_deploy`.
   No mesmo diretório e com as credenciais AWS da conta do state, revise
   `terraform -chdir=infra/lab plan` e execute `terraform -chdir=infra/lab apply`
   a partir da raiz do app. O executor precisa de acesso ao Kubernetes,
   `kubectl`, AWS CLI, OpenSSL, Bash e Python 3.

## O que o apply faz

Após verificar a conta e o cluster, o script usa uma sonda pelo pod do
backend para consultar o workspace e obter os `sub` pelas respostas do
Keycloak em TLS. Não é preciso copiar IDs nem registrar `sub` em `tfvars`.
Gera o primeiro certificado TLS da IA se necessário e guarda a chave no
Secret Kubernetes. Renderiza a configuração da IA e do backend sem incluir
segredos no plano/state. Aplica a IA primeiro e verifica o endpoint de status:
`200` para o indexador, `403` para o assistente fora da política e `401` sem
Bearer. Só então aplica o backend em OAuth, sem fallback para HMAC. Uma falha
de autorização ou CA interrompe o passo e não autoriza o corte do backend.

O apply não cria as contas do navegador, não publica imagens nem provisiona
as credenciais externas. O provisionador executa na criação/substituição do
objeto, não reconcilia drift. Para reaplicar após mudança externa de Secret,
CA ou renderer da IA, revise um plano com
`-replace='terraform_data.ai_oauth[0]'`; se apenas valores de Secrets/CAs
mudaram, reinicie os Deployments afetados para recarregá-los. Preserve o
Secret TLS nas reaplicações normais. Planeje rotação do certificado (prazo
de um ano) com uma janela de manutenção e atualização da confiança nos dois
lados; o helper não o renova automaticamente. Remover `ai_oauth` do state não
reverte o Kubernetes. Para rollback, restaure os manifests, digests e Secrets
compatíveis anteriores nos dois lados; não habilite HMAC automaticamente.

## Aceite na AWS

Após o apply, confirme login das duas contas e edite uma página. Verifique
indexação da nova versão, chat com fonte, escrita assistida (com OpenAI) e
leitura MCP de uma página defasada. Uma segunda execução com os mesmos
insumos não deve recriar identidades, volumes ou certificados. A sonda técnica
do apply não substitui este teste pela interface.
