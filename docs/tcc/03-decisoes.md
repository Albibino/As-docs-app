# Decisões

## D1. Sem login, mas com a mesma sessão JWT

**Decisão:** `POST /api/auth/select-user {userKey}` recebe `usuario-1` ou
`usuario-2` e emite a **mesma** sessão de antes (cookie `authToken` + linha em
`user_sessions`), usando `SessionService.createSessionAndToken`.

**Por quê:** WebSocket, Hocuspocus, permissões e todos os controllers dependem
de `@AuthUser()`/`@AuthWorkspace()` vindos do JWT. Manter a sessão preserva
toda a arquitetura existente; só a forma de obtê-la mudou.

**Consequência:** qualquer pessoa com acesso à URL pode entrar como Usuário 1
ou 2. É o requisito do TCC. Não publique o app com dados sensíveis.

## D2. Identidade fixa criada por seed idempotente

**Decisão:** `TccSeedService` (em `onApplicationBootstrap`) garante, numa
transação com *advisory lock*:
- o workspace (o primeiro existente ou um novo);
- os dois usuários (papel `owner`, e-mails `usuario1@tcc.local` e
  `usuario2@tcc.local`);
- o time, com os dois como admins;
- o space `documentos`.

**Por quê:** sem convites e sem cadastro, alguém precisa criar a identidade.
Fazer isso no boot dispensa passos manuais em Docker e Railway. Com os dois
usuários com as mesmas permissões, a edição simultânea funciona sem nenhuma
configuração.

## D3. Versão de conteúdo no Postgres, mantida por trigger

**Decisão:** a migração `20261002T120000-tcc-versioned-ai-index` cria:
- `pages.content_version`, incrementada por um trigger `BEFORE UPDATE` sempre
  que `title`, `content` ou `deleted_at` mudam;
- `pages.ai_indexed_version`, que o trigger impede de diminuir;
- um índice parcial para `ai_indexed_version < content_version`.

**Por quê:**
- O conteúdo muda por vários caminhos (Hocuspocus, REST, restauração de
  histórico, lixeira, importação). Um trigger cobre todos sem tocar em cada
  um.
- O trigger também ignora escritas diretas em `content_version`, então a versão
  não pode ser forjada pela aplicação.
- O requisito "considerar sempre a maior versão como atualizada" exige um
  número monotônico.

## D4. Indexação incremental pelo app (único escritor do índice)

**Decisão:** `AiIndexingService` busca as páginas pendentes, envia só a
**versão atual** (em Markdown) e, depois da confirmação, faz
`ai_indexed_version = GREATEST(ai_indexed_version, versão)`. Roda a cada
`DOCS_AI_INDEX_INTERVAL_SECONDS` (padrão 30) e sob demanda em
`POST /api/ai/chats/index/run`.

**Por quê:**
- Versões intermediárias não interessam: a IA só usa a maior.
- Reenviar é seguro, porque a IA ignora versões já indexadas.
- O intervalo deixa uma janela em que o índice fica atrás do app. Essa janela
  é exatamente o cenário que a leitura MCP cobre.

## D5. Servidor MCP próprio, somente leitura, com credencial delegada

**Decisão:**
- Endpoint `/mcp` (fora de `/api`), Streamable HTTP sem estado, usando o
  `@modelcontextprotocol/sdk` que já estava nas dependências.
- A cada pergunta, o app emite um JWT de 120 s com audiência `tcc-docs-mcp` e
  escopo `docs:read`, vinculado ao usuário e ao workspace. O serviço de IA usa
  esse JWT como Bearer.

**Por quê:**
- O MCP lê com as permissões do usuário que perguntou (`accessiblePageCondition`
  + membros do space), então a IA nunca vê o que o usuário não veria.
- A audiência própria impede que o token da sessão do navegador funcione no
  MCP, e vice-versa.

## D6. O chat é um proxy fino com persistência

**Decisão:** `AiChatService` valida a pergunta, grava a conversa nas tabelas
que já existiam (`ai_chats`/`ai_chat_messages`), emite a credencial MCP,
repassa a pergunta à IA e traduz o SSE para os eventos que o cliente já
consumia (`chat_created`, `content`, `done`, `error`), mais `freshness`,
`sources` e `not_found`.

**Por quê:** a decisão de responder ou não fica no serviço de IA, num único
lugar. O app só acrescenta links das páginas (filtrando pelo que o usuário pode
ver) e o histórico.

## D7. Correção em `accessiblePageCondition`

**Achado:** o predicado devolvia `(A) AND (B) OR EXISTS (…)` sem parênteses
externos. Qualquer `.where()` encadeado depois dele (por exemplo
`pages.id in (…)`) só restringia o primeiro ramo do `OR`. Na prática, a
consulta podia trazer páginas fora do filtro pedido.

**Decisão:** envolver o predicado inteiro em parênteses
(`page-permission.repo.ts`).

**Consequência:** corrige também a busca, os labels e as bases, que usam o
mesmo predicado. O teste de integração com Postgres cobre esse caso.

## D8. Clerk removido por completo

**Decisão:** remover código, dependências (`@clerk/backend`, `@clerk/react`),
configuração e objetos de banco do Clerk (migração
`20261002T130000-tcc-remove-clerk.ts`).

**Por quê:** o TCC não terá provedor de identidade externo (decisão do dono do
projeto). Manter colunas, tabelas e pacotes sem uso só confundiria quem for dar
manutenção.

**Consequência:** a migração é irreversível (o `down` não recria nada).
Voltar a ter login exigiria um projeto novo de autenticação.

## D9. Upload no chat removido

O chat do TCC responde só com base nos documentos do workspace. Arquivos
anexados seriam uma segunda fonte, fora do índice versionado, e quebrariam a
regra de "não usar o que não está nos documentos".

## D10. Módulos comerciais removidos, histórico de labels mantido

**Decisão:** remover billing, cloud, MFA, SCIM, auditoria genérica e chaves de
API do cliente, do servidor e do banco (migração
`20261002T160000-tcc-remove-optional-modules.ts`), junto com os pacotes
`posthog-js`, `stripe` e `scimmy`.

**Por quê:** o TCC roda um único workspace sem login, sem cobrança e sem
integrações externas de identidade. Esses módulos só apareciam como telas
"em desenvolvimento" e código morto.

**Exceção:** a tabela `audit` continua, porque o histórico de labels da página
é gravado nela por `LabelAuditService`. Remover a tabela tiraria uma
funcionalidade visível.

**Consequência:** a migração é irreversível. As chamadas de auditoria saíram
dos serviços; quem quiser auditoria no futuro precisa reintroduzir o módulo.

## D11. Home do space fixa, sem personalização

**Decisão:** remover a personalização da home do space (pessoal e da equipe),
com o editor de blocos, a API `/spaces/home/*` e a tabela
`space_home_layouts` (migração `20261007T120000-tcc-remove-space-home-layouts.ts`).
A home do space mostra o título, a descrição e as páginas de primeiro nível;
sem páginas, mostra o estado vazio com "Criar primeira página".

**Por quê:** o TCC tem um único space e dois usuários fixos. A personalização
não faz parte do escopo e só acrescentava telas e código a manter.

**Consequência:** a migração é irreversível e apaga os layouts gravados. O
índice `idx_pages_last_updated_by_recent`, criado na mesma migração que a
tabela, continua, porque atende o histórico do cabeçalho.

## D12. Painel de escrita assistida reescrito fora do código empresarial

**Decisão:** o painel do editor deixou de usar `apps/client/src/ee/ai/` (licença
empresarial do Docmost, que não pode ir para produção) e passou a viver em
`apps/client/src/features/assisted-writing/` (AGPL-3.0), exportado como
`AssistedWritingPanel`. O código antigo do menu (`ai-menu`, `command-items`,
`command-selector`, `result-preview`, CSS) foi apagado, não adaptado. Foram só
movidos, com `git mv`, os arquivos escritos para o TCC e sem dependência do
código empresarial: `domain/*`, `services/assisted-writing-service.ts` e o modal
de revisão de links.

**Por quê:** a pasta `ee/` será removida; sem o painel, o editor perderia a
escrita assistida, que é a funcionalidade central do TCC.

**Consequência:** o painel foi reorganizado em hooks (`use-writing-session`,
`use-proposal-request`, `use-apply-proposal`, `use-undo`, `use-page-metadata`,
`use-selection-anchor`) e componentes pequenos, com textos via `t()`. Os rótulos
de `domain/operation-label.ts` usam o texto em português como chave de tradução
(o inglês está em `en-US`); as demais chaves novas seguem a convenção do projeto
(chave em inglês). O comportamento visível, os seletores e os textos que
`scripts/tcc-assisted-writing-ui.cjs` espera ficaram iguais.

Os identificadores de sessão e dos blocos inseridos por propostas usam UUID v4
via `uuid`, assim como a chave de requisição da restauração de histórico. No
laboratório HTTP isso evita depender de `crypto.randomUUID()` para abrir o
editor, sem mudar os formatos dos identificadores nem os hashes dos blocos.

## D13. Somente o núcleo AGPL-3.0

**Decisão:** o repositório só contém código sob a AGPL-3.0. Foram removidos
`apps/client/src/ee/`, `packages/ee/` e o pacote `packages/base-formula` (os
três sob a *Docmost Enterprise License*), todas as referências a eles no
cliente e no servidor e os carregamentos opcionais de `ee/` no servidor. Os
recursos pagos saíram em vez de serem reimplementados; botões que dependiam de
`useHasFeature` foram removidos, não desabilitados. O `LICENSE` da raiz é o da
AGPL-3.0 e o aviso *Copyright (c) Docmost, Inc.* continua nos arquivos e no
README.

**Por quê:** o código empresarial só pode ir para produção com assinatura do
Docmost, e o TCC será publicado.

**Consequência:** bases, verificação de páginas, segurança/SSO, espaço pessoal,
resolução de comentários, busca com IA e de anexos, configurações de IA/MCP,
restrição de página, entitlements e importação de DOCX, PDF e Confluence não
existem mais. O chat (`features/assistant`) e a escrita assistida
(`features/assisted-writing`) são código novo do TCC, fora do `ee/`. Detalhes em
`02-cortes-de-funcionalidade.md`. Não reintroduza código sob a licença
empresarial, nem um stub chamado `ee`.

## D14. Escopo confirmado para OAuth 2.0 e OpenID Connect (entrega local)

Após o planejamento solicitado, o dono confirmou:

- **Keycloak** como provedor de identidade e servidor de autorização;
- manutenção dos **dois usuários locais atuais**, vinculados a duas contas do
  provedor, sem cadastro aberto;
- **primeira entrega somente local**, usando a stack Docker Compose existente;
  implantação AWS fica para uma etapa posterior.

O objetivo continua sendo entrada OIDC com Authorization Code + PKCE e
substituição do HMAC app → IA por Client Credentials. O diagnóstico, a
arquitetura recomendada, as etapas e os testes estão em
[09-plano-oauth2-oidc.md](09-plano-oauth2-oidc.md).

**Autorização posterior:** o dono autorizou iniciar a implementação e pediu
expressamente a remoção dos bloqueios no `AGENTS.md`. O arquivo foi revisado
para permitir a entrada OIDC dos dois usuários, o Keycloak na stack local e
a migração do HMAC app → IA para Client Credentials. A exceção de ferramenta
se limita ao Keycloak local; novos pacotes ou ferramentas continuam exigindo
autorização específica. A restrição ao trabalho nos dois repositórios foi
preservada, explicitando o nome `As-docs-ai` usado neste checkout.

## D15. Login local por Keycloak, com a mesma sessão do app

Com `OIDC_ENABLED=true`, `/api/auth/users` e `/api/auth/select-user` deixam
de servir o seletor. Sessões e tokens de colaboração do fluxo legado não
são aceitos nesse modo. O BFF é um cliente confidencial: usa Authorization Code
com PKCE S256 e valida o ID Token antes de resolver `(iss, sub)` na tabela
`oidc_accounts`. O callback não cria nem vincula usuários automaticamente.

O navegador recebe somente o cookie da sessão local, não tokens do Keycloak.
O fluxo usa uma transação Redis de cinco minutos vinculada ao navegador e
consumida uma vez. O logout revoga a sessão local; o próximo login exige nova
autenticação no provedor. Isso não encerra a sessão SSO do Keycloak nem
promete revogação imediata das conexões de colaboração já abertas.

O modo legado permanece disponível onde OIDC não foi ativado; não serve de
fallback quando o provedor OIDC está indisponível. O Compose local usa um JWT
de oito horas por padrão. HTTP e `start-dev` ficam restritos ao laboratório.
O transporte app → IA tem configuração independente (D16).
Ver [10-keycloak-local.md](10-keycloak-local.md).

## D16. Client Credentials entre o app e a IA no Compose local

O backend usa clientes técnicos distintos para indexação e assistência. Ele
pede apenas o escopo da operação e guarda tokens em memória por cliente e
escopo. Em `401` antes do SSE, tenta uma vez com um token renovado e preserva
o corpo e a chave de idempotência; `403` não provoca renovação.

A IA verifica assinatura, emissor, audiência, prazo, conta de serviço e
escopo, e restringe cada cliente ao workspace cadastrado. O Compose usa
`DOCS_AI_OAUTH_ENABLED` nos dois serviços. Quando ativa, essa configuração
não aceita HMAC. O login web, `APP_SECRET` e a delegação MCP permanecem
separados. Para o corte explícito, `docker-compose.oauth.yml` ativa os dois
lados, retira o segredo HMAC dos containers e exige Keycloak saudável na
subida. Consulte [o roteiro de ativação](10-keycloak-local.md#5-clientes-técnicos-da-ia).

## D17. Servidor de identidade no EKS

Na etapa AWS autorizada posteriormente, o Keycloak usa um Deployment no EKS
privado e banco/role exclusivos no RDS existente. Seu realm é servido em
`https://<domínio>/id/realms/as-docs` no ALB com WAF; administração e gestão
não têm rota pública. O state da borda não recebe credenciais. O corte de login
do app exige os vínculos de conta do issuer AWS; o transporte para a IA não é
ativado enquanto o trecho backend → IA não estiver em HTTPS. Ver
[provisionamento e verificação](../../infra/edge/KEYCLOAK.md).

O provisionador do Keycloak baixa o bundle público do RDS de `us-east-1`
e aplica o ConfigMap usado pela conexão JDBC. O RDS continua exigindo TLS
e o Keycloak continua validando o hostname (`verify-full`); não há certificado
de cliente para gerar nesse trecho.

## D18. Conta da sessão no backend S3 da rede e do EKS

O backend da rede e do EKS não restringe o ID da conta da sessão; as permissões
do S3 continuam obrigatórias. O bucket, a chave do state e a validação de
`expected_account_id` no provider não mudaram. Uma implantação em outra conta
deve usar state próprio e as roles do EKS dessa conta. Ver
[Backend e colaboração](../../infra/terraform/README.md#backend-e-colaboração).

## D19. Terraform individual para testes no AWS Academy

Cada integrante aplica a raiz `infra/lab` em uma conta sem recursos do projeto
e mantém um único state local. A raiz usa a identidade da sessão, vincula o
state à conta do primeiro `apply` e permite uma trava de conta opcional antes
do primeiro plano. Ela passa os outputs entre rede/EKS, RDS e borda e não lê
nem migra o state S3 do grupo.

No modo padrão `learner_lab`, a raiz descobre as roles EKS fornecidas pelo
Academy, reutiliza `LabInstanceProfile` e não cria roles nem anexa políticas.
O CSI usa a `LabRole` existente dos nós; a aplicação da política contra
IMDS antes dos workloads é obrigatória. O RDS recebe uma senha efêmera via
`TF_VAR_db_password`, sem depender da integração com o Secrets Manager.
Em `managed`, uma conta que permite criar IAM continua podendo usar Pod
Identity e senha gerenciada pelo RDS. Use states separados para os modos.
A borda recebe o Auto Scaling Group do EKS nos dois casos. A implantação
compartilhada mantém a configuração anterior. Ver o
[roteiro e as restrições do laboratório](../../infra/lab/README.md).

## D20. Deploy AWS separado do provisionamento

O manifesto da aplicação adota o NodePort 30300 do NLB criado pelo Terraform.
O deploy público usa HTTPS por padrão e OIDC do Keycloak, sem seletor legado.
Frontend e backend são publicados como imagens separadas e implantados por
digest, ambos associados ao SHA de origem. O fluxo manual fica em
[Deploy na AWS](../../deploy/README.md); a futura automação da `main` pode
reutilizá-lo sem atualizar o código diretamente nas EC2.

## D21. CI da main e primeiro deploy do laboratório

Reutilizar o CI do Pedro Muci para PRs e pushes na `main`. O CD publicará
artefatos por digest e reutilizará o procedimento do primeiro deploy, separado
do `terraform apply`. O laboratório terá duas contas descartáveis no Keycloak,
com senha igual ao login; a exceção não vale para contas administrativas ou
técnicas. Ver [reaproveitamento e pendências](12-entrega-aws-ci-cd.md).

O modo opt-in `lab_full_deploy` substitui a separação descrita acima apenas
para o Learner Lab descartável com state novo. O mesmo `apply` publica as
imagens no ECR da conta e usa seus digests para implantar o app e a IA, após
preparar o banco, o Keycloak e os vínculos OIDC. O fluxo por digests informados
continua disponível para ambientes já provisionados. Ver
[deploy integral](../../infra/lab/README.md#deploy-integral-em-um-learner-lab-novo).

As tags imutáveis usam os manifestos de entradas de build versionados nos
dois repositórios. Eles vêm do seletor de arquivos do publicador. Antes de
reaproveitar ou publicar uma tag, o script compara o hash das entradas reais
com o planejado; antes de construir, confere também a cópia entregue ao Docker.
Configuração privada, como `.npmrc`, não entra em nenhum dos dois cálculos.

## D22. Login HTTP opt-in no Learner Lab

O dono autorizou login pelo DNS padrão HTTP do ALB para o laboratório
descartável. O HTTPS continua padrão. A exceção não libera cadastro, seletor,
administração ou emissão pública de tokens, nem altera o OAuth técnico da IA.
Discovery, JWKS e troca de código do backend continuam no HTTPS privado do
Keycloak. Ver [procedimento HTTP](../../infra/edge/KEYCLOAK.md#modo-http-do-learner-lab).

## D23. Client Credentials no deploy individual da AWS

Após o bootstrap, `infra/lab` pode implantar IA e backend por digest com a
opção `ai_oauth`. Os `sub` técnicos e o workspace são descobertos na conta do
laboratório; segredos não vão para o plano ou state. A IA é privada e o
provisionador verifica autorização antes de ativar OAuth no backend. Quando
o login HTTP já está autorizado no Learner Lab, o issuer anunciado continua
o mesmo, mas troca de tokens e JWKS usam exclusivamente TLS privado. Não há
fallback para HMAC. Ver [provisionamento e aceite](13-ia-oauth-aws.md).

No laboratório individual, o mesmo apply pode instalar o backend e
ativar `ai_oauth`. Se faltar o Secret técnico, um pod efêmero com acesso
privado ao Keycloak valida os clientes do realm e transfere as duas
credenciais existentes ao Kubernetes sem rotacionar nem gravar no state.

## D24. Deploy do app pelo apply do laboratório

Na raiz `infra/lab`, `app_deploy` fixa os digests de frontend e backend no ECR
da conta. Quando configurado, o `apply` espera o Keycloak e o armazenamento,
implanta Redis e backend, executa `ai_oauth` se configurado e atualiza as duas
EC2 por SSM, uma por vez. As sondas do app e do ALB verificam a entrega; isso
não substitui a validação do callback OIDC. Imagens, credenciais e vínculos do
realm continuam pré-requisitos; a implantação compartilhada não muda.

## D25. Entrega da chave OpenAI no EKS pelo apply

A raiz `infra/lab` pode receber a chave de um arquivo privado ignorado pelo
Git. A variável é sensível e efêmera; o Secret Kubernetes é aplicado via
stdin, sem registrar o valor no plano ou state. A revisão não secreta permite
atualizar o Secret de propósito. A entrega da chave não habilita a IA nem
substitui as credenciais técnicas do Keycloak.

## D26. Keycloak em dois nós no laboratório AWS

Com o Keycloak ativo em `infra/lab`, o padrão é duas réplicas em nós
distintos, preferindo zonas distintas, com Infinispan, descoberta
`jdbc-ping` no RDS existente e mTLS interno. A borda continua na porta de
aplicação e não encaminha as portas do cache. A borda legada mantém uma
réplica por padrão. Dois nós aptos são necessários; a troca inicial do cache
local pode afetar logins em andamento. Ver a
[verificação das réplicas](../../infra/edge/KEYCLOAK.md#réplicas-em-nós-distintos).
