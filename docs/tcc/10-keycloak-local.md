# Keycloak na stack local

A fundação do [plano OAuth 2.0/OIDC](09-plano-oauth2-oidc.md) usa Keycloak e
um Postgres próprio, com volume persistente. O frontend (`127.0.0.1:8080`)
e o Keycloak (`127.0.0.1:9090`) são os únicos serviços publicados. O Postgres
do Keycloak não participa da rede do app; o healthcheck usa a porta de gestão
9000 dentro do próprio contêiner. Use `start-dev` e HTTP apenas neste laboratório.

## 1. Preparar a configuração local

Na raiz do app, use um arquivo fora do checkout. O exemplo abaixo não
sobrescreve um arquivo existente nem toca no `.env` do projeto:

```bash
env_file="$HOME/.config/as-docs-local/compose.env"
(umask 077; mkdir -p "$(dirname "$env_file")"; set -C; cat .env.example > "$env_file")
```

Edite esse arquivo localmente:

- Configure `APP_SECRET` com um valor aleatório novo, diferente do usado pela
  implantação legada. Preencha também `DOCS_AI_HMAC_SECRET` enquanto o Compose
  ainda usa HMAC para a IA. Use valores independentes, por exemplo `openssl rand -hex 32`.
- Defina `KEYCLOAK_DB_PASSWORD` com um terceiro valor independente e escolha
  `KEYCLOAK_ADMIN_USERNAME` e uma senha forte em `KEYCLOAK_ADMIN_PASSWORD`.
  O admin de bootstrap é temporário e só é criado na inicialização do realm de
  administração. Não use essa conta para entrar no app.
- Se trocar `DB_PASSWORD`, use caracteres seguros para uma URL (hexadecimal,
  por exemplo). Em um volume já inicializado, alterar a variável não troca a
  senha do usuário do Postgres.
- Mantenha `OIDC_ENABLED=false` e o segredo web vazio até terminar os vínculos.
  Não exporte variáveis homônimas no shell: elas têm precedência sobre o arquivo.

## 2. Subir o provedor, migrar o app e rodar o seed

```bash
docker compose --env-file "$env_file" --profile oidc config --quiet
docker compose --env-file "$env_file" up -d --wait keycloak db redis
docker compose --env-file "$env_file" up -d --build --wait backend
docker compose --env-file "$env_file" exec -T db psql -X -U asdocs -d asdocs \
  -c '\d public.oidc_accounts'
```

O alvo explícito `keycloak` ativa seu perfil e traz `keycloak-db`. O backend
da imagem roda as migrações no boot em modo produção e executa o seed dos dois
usuários. Confirme que a tabela da migração `oidc_accounts` existe antes de
vincular contas. O frontend ainda não foi publicado nesse passo.

O arquivo `config/keycloak/as-docs-realm.json` contém só configuração. A
importação inicial é pulada se o realm já existir: editar o JSON ou reiniciar
não altera usuários, clientes, chaves, nem segredos persistidos. Aplique
mudanças deliberadas pelo console administrativo. Para testar uma nova
importação, use um volume descartável em outro projeto, com a porta local
livre. Não use `down -v` no ambiente com dados.

## 3. Criar as duas contas e vincular IDs

1. Abra `http://localhost:9090/admin/`. Entre com o admin local e selecione
   **as-docs**, não **master**. Se o ambiente persistir, crie e confira uma
   conta administrativa permanente separada no realm `master` e retire o admin
   temporário; remova o usuário e a senha de bootstrap do arquivo de ambiente
   após confirmar a recuperação administrativa.
2. Em **Users**, crie exatamente as duas contas humanas, uma para cada operador
   do app. Atribua senhas distintas na aba **Credentials**; se forem temporárias,
   o operador troca a senha no primeiro login. Não habilite cadastro público.
3. Abra cada conta e copie seu **ID** do Keycloak (UUID nos detalhes da conta ou
   no caminho da página). Sem mapeador pairwise, esse ID é o `sub` desta conta
   no cliente `docs-app-web`. Confira qual operador controla cada uma.
4. Consulte os IDs dos dois usuários do app. O nome e o e-mail abaixo servem só
   para o operador reconhecer os registros locais; não são usados no login nem
   enviados ao script:

   ```bash
   docker compose --env-file "$env_file" exec -T db psql -X -U asdocs -d asdocs \
     -c "SELECT id, name, email, workspace_id FROM users
         WHERE deleted_at IS NULL AND deactivated_at IS NULL ORDER BY email;"
   ```

5. Confirme os pares **ID Keycloak → ID do app** e aplique ambos na mesma
   transação. Coloque os UUIDs literalmente nas variáveis abaixo, na ordem
   correspondente aos dois operadores:

   ```bash
   bash scripts/tcc-link-oidc.sh "$env_file" "$sub1" "$user_id1" "$sub2" "$user_id2"
   ```

   O script só escreve em `oidc_accounts`. Se já existirem os mesmos dois
   vínculos, a operação é idempotente. Se encontrar um vínculo divergente ou um
   terceiro vínculo para esse issuer, aborta sem sobrescrever nada. Se uma
   conta Keycloak for recriada, terá outro `sub`; trate a troca como revogação e
   reprovisionamento deliberados, nunca como associação por nome ou e-mail.

## 4. Ativar a entrada OIDC

No Keycloak, em **Clients → docs-app-web → Credentials**, obtenha o segredo
atribuído ao cliente e guarde-o somente no arquivo de ambiente como
`OIDC_CLIENT_SECRET_WEB`. Confira estas outras entradas e ative OIDC:

```dotenv
APP_URL=http://localhost:8080
OIDC_ENABLED=true
OIDC_ISSUER=http://localhost:9090/realms/as-docs
OIDC_BACKCHANNEL_URL=http://keycloak:8080
OIDC_CLIENT_ID=docs-app-web
JWT_TOKEN_EXPIRES_IN=8h
```

```bash
docker compose --env-file "$env_file" --profile oidc up -d --build --wait
```

O callback cadastrado é **`http://localhost:8080/api/auth/oidc/callback`**.
Use `localhost` no navegador, não `127.0.0.1`. A URL de backchannel é apenas a
**origem interna**: o backend troca a origem das requisições servidor a servidor
endereçadas à origem canônica, preservando caminho e parâmetros. URLs do
navegador e a validação de `iss` permanecem canônicas. O Nginx omite logs de
acesso e erro do callback, inclusive com barra final, para não registrar
`code` ou `state`.

No Docker, confirme a descoberta pelas duas origens:

```bash
curl -fsS http://localhost:9090/realms/as-docs/.well-known/openid-configuration
docker compose --env-file "$env_file" exec -T backend \
  curl -fsS http://keycloak:8080/realms/as-docs/.well-known/openid-configuration
```

Ambas devem anunciar o mesmo `issuer`, o mesmo `authorization_endpoint` e o
mesmo `jwks_uri`, sempre em `http://localhost:9090`. Teste as duas contas em
contextos de navegador separados. O cliente web aceita Authorization Code com
PKCE S256 e credencial confidencial no backend; não aceita Password Grant nem
Client Credentials.

## 5. Clientes técnicos da IA

Os dois clientes permitem `client_credentials` e recebem `aud=docs-ai` no
access token. O backend deve pedir explicitamente o(s) escopo(s) da operação
no parâmetro `scope` ao obter o token:

| Cliente | Escopos opcionais concedidos |
| --- | --- |
| `docs-app-indexer` | `ai:index:write`, `ai:index:read` |
| `docs-app-assistant` | `ai:chat:invoke`, `ai:writing:invoke` |

`docs-ai` é apenas o registro da audiência. Nenhum cliente ganha escopo de
embeddings. Para preparar o corte coordenado no Compose local:

1. No console do Keycloak, selecione o realm `as-docs` e abra **Clients**.
   Nas abas **Credentials** de `docs-app-indexer` e `docs-app-assistant`,
   obtenha seus segredos e configure-os no arquivo de ambiente local como
   `OIDC_CLIENT_SECRET_INDEXER` e `OIDC_CLIENT_SECRET_ASSISTANT`. A IA e o
   navegador não recebem essas credenciais.
2. Confira o ID da conta de serviço de cada cliente na aba **Service Account
   Roles** (ou pelo endpoint administrativo
   `GET /admin/realms/as-docs/clients/{client-uuid}/service-account-user`, campo
   `id`). Use esse ID como `subject`, não o ID do cliente nem seu nome. Não
   copie tokens, segredos ou cabeçalhos de autenticação para logs ou para o Git.
3. Pegue o ID do workspace do app após as migrações e o seed:

   ```bash
   docker compose --env-file "$env_file" exec -T db psql -XAt -U asdocs -d asdocs \
     -c 'SELECT id FROM workspaces;'
   ```

4. Autorize um único workspace por cliente no mesmo arquivo local. Exemplo
   ilustrativo; substitua os três marcadores por seus UUIDs reais:

   ```dotenv
   AI_OAUTH_CLIENTS_JSON='{"docs-app-indexer":{"subject":"<sub-indexador>","tenantId":"<workspace-id>"},"docs-app-assistant":{"subject":"<sub-assistente>","tenantId":"<workspace-id>"}}'
   AI_OIDC_JWKS_URL=http://keycloak:8080/realms/as-docs/protocol/openid-connect/certs
   DOCS_AI_OAUTH_ENABLED=true
   ```

A flag é compartilhada pelo Compose entre o backend e a IA para evitar modos
incompatíveis. Na ativação, retire `DOCS_AI_HMAC_SECRET` do arquivo local.
Mantenha `APP_SECRET`, que protege a sessão local e a credencial MCP,
independentemente do transporte. Com o Keycloak saudável, recrie os dois
serviços juntos para que nenhuma instância antiga continue falando HMAC:

```bash
docker compose --env-file "$env_file" --profile oidc config --quiet
docker compose --env-file "$env_file" --profile oidc up -d --build --wait backend ai
docker compose --env-file "$env_file" --profile oidc exec -T ai \
  python -c 'from urllib.request import urlopen; print(urlopen("http://127.0.0.1:8000/health/ready", timeout=5).status)'
```

O `200` confirma a configuração e os serviços locais da IA, mas não confirma
emissão ou validação de tokens. Para validar o corte, indexe uma página e
faça uma pergunta sobre ela; para exercitar a credencial MCP separada, atualize
a página e pergunte antes que a nova versão seja indexada.

Para voltar ao modo legado, escolha explicitamente `DOCS_AI_OAUTH_ENABLED=false`
e restaure a configuração HMAC dos dois lados. Não desligue `OIDC_ENABLED` para
fazer esse rollback; o login de usuários é independente. A concessão de HTTP
restringe-se ao laboratório local e não se aplica aos manifests AWS. Em
OAuth, o backend só envia Bearer por HTTP a `http://ai:8000` com issuer
HTTP em `localhost`. O backchannel HTTP do Keycloak também exige esse issuer
local, com destino interno `http://keycloak:8080` ou de loopback.

## Verificações da fundação

Em projetos descartáveis, o Compose iniciou Keycloak e Postgres saudáveis.
Discovery e JWKS responderam, com a origem canônica anunciada tanto na porta
publicada quanto na rede Docker. Com duas contas de teste, Authorization Code
com PKCE emitiu ID tokens cujo `sub` correspondia ao ID de cada conta. O
Keycloak rejeitou reuso de código, Password Grant e Client Credentials do
cliente web. Os clientes técnicos emitiram tokens com a audiência e o escopo
esperados e não aceitaram o escopo do outro cliente.

O provisionamento recusou a execução sem a migração; após o boot do backend,
gravou os dois vínculos, aceitou a repetição e recusou a troca dos pares sem
alterar os dados. No Nginx, o callback foi encaminhado sem logar a query, mesmo
quando o upstream respondeu com erro de conexão (502). Esses testes não
substituem o E2E do app e da IA após a integração do fluxo completo.

## Verificação executada

O fluxo HTTP de login passou contra Keycloak, backend, Redis e Postgres reais
em um projeto Compose descartável, com credenciais próprias de teste. Os dois
usuários vinculados receberam a sessão correta; o logout invalidou a sessão
local, a repetição do callback foi rejeitada e um terceiro usuário, sem vínculo,
não recebeu sessão. Além disso, as duas rotas do seletor legado retornaram
`410` com OIDC ativo.

Valide também a página `/login` no navegador pela porta do frontend. O
endpoint `/api/auth/oidc/status` devolve `data.enabled` no envelope padrão do
backend; uma resposta HTTP 200 sozinha não comprova que o botão de login
aparece. Os testes da interface no Vitest usam esse mesmo envelope. A
colaboração simultânea fica fora desta verificação.

## Verificação do Client Credentials

Em um projeto Compose descartável, o backend e a IA foram reconstruídos e
executados com OAuth ativo, sem segredo HMAC e sem chave OpenAI. Tokens reais
emitidos pelo Keycloak deram acesso à consulta de estado do índice. A IA
retornou `401` para cabeçalhos HMAC sem Bearer e `403` para cliente, escopo ou
workspace sem permissão e para embeddings. O `scripts/tcc-e2e.py` passou com
indexação das duas versões, chat via índice e leitura MCP da versão mais nova
quando o índice estava defasado.

O roteiro usou o seletor legado apenas no projeto isolado, para verificar o
transporte técnico sem mudar o fluxo de login já verificado separadamente.
Escrita assistida passou em testes automatizados com um provedor substituto;
este teste ponta a ponta não usou o modelo real para gerar, aplicar ou desfazer
uma proposta. A stack existente não foi reiniciada nem migrada.
