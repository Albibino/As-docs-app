# Cortes de funcionalidade

Objetivo: manter um único workspace, time e space funcionais, sem login nem
convites, com 2 usuários fixos, edição simultânea mantida e publicação de
páginas removida.

## Removido

| Funcionalidade | Servidor | Cliente |
|---|---|---|
| Login, cadastro, senha, SSO, MFA | `auth.controller` reescrito; `signup.service`, DTOs de login/senha/setup e `setup.guard` removidos. | Telas de login, cadastro, setup, SSO, MFA, verificação de e-mail, *cloud login* e criação de workspace removidas das rotas. |
| Clerk | `clerk-auth.service`, `clerk-auth.guard`, `clerk-bootstrap.guard` e variáveis `CLERK_*` removidos. `JwtAuthGuard` só valida o JWT local. | `ClerkProvider`, a ponte de token e os componentes do Clerk removidos de `main.tsx` e `api-client.ts`. |
| Convites | Rotas `/workspace/invites/*`, serviços e DTOs de convite e a tabela `workspace_invitations` removidos. | Telas e componentes de convite removidos; "Membros" virou lista somente leitura. |
| Diretório externo de clientes | A integração com o diretório, os repositórios `directory`, a propriedade de página do tipo `customer` e o `page/customer/set` removidos. | Seletor "Cliente" da página (`PageCustomer`), tipo de propriedade `customer` e respectivas traduções removidos. |
| Publicação e compartilhamento público | `core/share`, `PagePublicationRepo`, publicação no histórico, rotas públicas de bases e as tabelas `shares`/`page_publications`, além da coluna `pages.published_revision_id`. | Rotas `/share/*`, painel de publicação do histórico, modal de compartilhamento público de bases e a tela de configurações "Sharing". |
| Gestão de times e spaces | `teams` somente leitura; `spaces/create`, `archive` e `restore` removidos. | Botões de criar space e time, arquivar space e gerenciar membros removidos. |
| Upload de arquivos no chat da IA | Não foi portado para o chat novo. | Botão e chips de anexo removidos. |
| Personalização da home do space | `SpaceHomeController` (`/spaces/home/*`), `SpaceHomeService`, `SpaceGraphService`, `SpaceHomeLayoutRepo`, o schema do layout e a tabela `space_home_layouts` (migração `20261007T120000-tcc-remove-space-home-layouts.ts`). | "Personalizar para mim", "Personalizar home da equipe", o editor de seções e blocos (texto, links, páginas, pessoas, incorporação, base, gráfico e grafo do space). A home do space ficou fixa: título, descrição e páginas do space. |

## Mantido

- Edição colaborativa em tempo real (WebSocket + Hocuspocus), cursores e
  presença.
- Permissões de leitura e edição de página no servidor (as regras de space e
  de página continuam valendo; o que saiu foi o modal de restrição no cliente).
- Histórico e restauração de versões, comentários, labels (com o histórico de
  labels da página), favoritos, busca de páginas, exportação (Markdown, HTML,
  PDF e Word, geradas pelo núcleo) e importação de Markdown, HTML, ZIP genérico,
  Notion e pasta.
- Escrita assistida (`integrations/assisted-writing`).

## Clerk: removido por completo

A migração `20261002T130000-tcc-remove-clerk.ts` remove:
- `users.clerk_user_id` e o índice `idx_users_workspace_clerk_user_id_unique`;
- `workspaces.clerk_organization_id`;
- as tabelas `principal_profile_projections`,
  `organization_access_projections` e `directory_event_receipts` (espelho das
  identidades do Clerk via diretório externo).

Também saíram as dependências `@clerk/backend` (servidor) e `@clerk/react`
(cliente), com o `pnpm-lock.yaml` atualizado pelo `pnpm remove`, a variável
`VITE_CLERK_PUBLISHABLE_KEY`, as funções `getClerkPublishableKey`,
`isClerkConfigured` e `isClerkDevelopmentInstance` de `lib/config.ts`, as
mensagens de erro do Clerk nos locales en-US e pt-BR, e
`UserRepo.findByClerkUserId`.

As migrações antigas que criaram esses objetos foram mantidas: o histórico do
Kysely as exige em bancos que já as aplicaram.

## Billing, cloud, MFA, SCIM, auditoria e chaves de API: removidos

Eram módulos do produto comercial que o TCC não usa. Saíram do cliente, do
servidor e do banco:

- **Billing e cloud:** modo `CLOUD` (subdomínio por workspace, período de
  avaliação, fila de cobrança, webhook do Stripe), `isCloud()` no cliente e no
  servidor, login da nuvem, escolha de workspace por e-mail, hostname
  editável, PostHog (só era ligado na nuvem) e as variáveis `CLOUD`,
  `SUBDOMAIN_HOST`, `BILLING_TRIAL_DAYS`, `STRIPE_*` e `POSTHOG_*` do
  `window.CONFIG`. O `DomainService` devolve sempre `APP_URL` e o
  `DomainMiddleware` usa sempre o único workspace.
- **MFA:** `ee/mfa/`, seção de MFA na conta, "Exigir autenticação em duas
  etapas" em Segurança, token `mfa_token` e `UserRepo.withUserMfa`.
- **SCIM:** `ee/scim/`, bloco de SCIM em Segurança, parser
  `application/scim+json` em `main.ts`, `isScimEnabled` e `scimExternalId`.
- **Chaves de API:** `ee/api-key/`, telas "Chaves de API" (conta) e
  "Gerenciamento de API" (workspace), JWT do tipo `api_key`, assunto CASL
  `api_key`, "Restringir criação de chaves a administradores"
  (`restrictApiToAdmins`, `settings.api`).
- **Auditoria genérica:** `ee/audit/` (tela "Audit log"), o
  `NoopAuditModule`, o `AuditActorInterceptor`, a fila `audit`, as ~40
  chamadas `auditService.log(...)` espalhadas pelos serviços (e o código que
  só existia para montar o "antes/depois" delas) e o assunto CASL `audit`.
- **Pacotes:** `posthog-js` (cliente), `stripe` e `scimmy` (servidor), com o
  patch `patches/scimmy@1.3.5.patch` e a linha `COPY patches` do Dockerfile.
- **Traduções:** 106 chaves que ficaram sem uso (97 nos outros idiomas). Chaves
  genéricas como "Error", "Update" e "Never" ficaram.
- **Banco:** a migração `20261002T160000-tcc-remove-optional-modules.ts` apaga
  `billing`, `user_mfa`, `scim_tokens`, `api_keys`, as colunas
  `users.scim_external_id`, `groups.scim_external_id`,
  `workspaces.{stripe_customer_id, billing_email, trial_end_at, enforce_mfa,
  is_scim_enabled, audit_retention_days}` e a chave `api` das configurações do
  workspace. Coberta por `database/tcc-cleanup-migrations.integration.spec.ts`.

**Ficou de propósito:** a tabela `audit`. Apesar do nome, ela guarda o
histórico de labels (`LabelAuditService`), mostrado no painel de detalhes da
página; `common/events/audit-events.ts` foi reduzido aos eventos de label. O
`AuditContextMiddleware` também fica, porque a sessão usa o IP e o navegador
que ele captura. `workspaces.plan`, `status` e `hostname` ficam porque o seed e
o cálculo de licença ainda os leem.

## Modelos de página: removidos

A função de modelos de página ("templates") saiu por completo:

- **Cliente:** telas `/templates` e `/templates/:id` (`ee/template/` inteiro),
  item "Modelos" da barra lateral global e do menu do space, opção "Permitir
  que membros criem modelos" nas configurações do workspace e 34 traduções
  que ficaram sem uso. Favoritos aceitam só página e space.
- **Servidor:** módulo `core/template` (controller, service, DTOs, conteúdo),
  `TemplateRepo`, documentos colaborativos `template.*` (autenticação e
  persistência do Hocuspocus), labels por modelo no `LabelService`/`LabelRepo`,
  favoritos de modelo e a configuração `allowMemberTemplates`.
- **Banco:** a migração `20261002T150000-tcc-remove-page-templates.ts` apaga
  favoritos de modelo e a coluna `favorites.template_id`, as tabelas
  `templates`, `template_labels` e `template_required_groups` (com gatilhos e
  funções) e a chave `templates` das configurações do workspace. As labels em
  si continuam. Coberta por `database/tcc-cleanup-migrations.integration.spec.ts`.

## Home sem diretório de times

A home mostra só a saudação e a pergunta à IA. O diretório de times
(`features/team/components/team-directory.tsx`, com "Gerenciar times") foi
removido, assim como o atalho "Times" da barra lateral global, que apontava
para ele. A seção "Times" da barra lateral continua: ela lista o único time e é
o caminho para o space. O link "Ver todos os times" agora leva a
Configurações → Times.

## Diretório externo: removido do banco

A migração `20261002T140000-tcc-remove-customer-directory.ts`:
- apaga as propriedades de página do tipo `customer` e os valores delas, e
  restringe a constraint a `date`, `number` e `person`;
- remove `pages.customer_key` e o índice `pages_customer_key_idx`;
- remove a tabela `customer_directory_projections`;
- remove `workspaces.directory_organization_key` e o índice dela.

As duas migrações de limpeza (Clerk e Directory) são cobertas por
`database/tcc-cleanup-migrations.integration.spec.ts`. O teste simula um banco
antigo com esses dados, aplica as migrações e confere que tudo sumiu, que as
outras propriedades ficaram e que o tipo `customer` passa a ser recusado.

## Módulos da licença empresarial: removidos

`apps/client/src/ee/` e `packages/ee/` estavam sob a *Docmost Enterprise
License*, que só permite produção com assinatura. O projeto ficou só com o
núcleo AGPL-3.0. Saíram as pastas `apps/client/src/ee/` (260 arquivos) e
`packages/ee/`, o pacote `packages/base-formula` (também sob a licença
empresarial), os aliases `@tcc-docs/ee/*` (tsconfig, jest e jest-e2e do
servidor) e a dependência `@tcc-docs/base-formula` do cliente, do servidor, do
`pnpm-lock.yaml` e do `Dockerfile`. O servidor já não tinha `src/ee`.

| Módulo | O que saiu |
|---|---|
| Bases | Página do tipo base (`BasePage`, `BaseView`), nó `BaseEmbed` no editor (a extensão em `packages/editor-ext` continua, é AGPL, mas o cliente não a registra), itens "Base (Inline)" e "Kanban" do menu `/` e da barra fixa, "converter em base" na página vazia (`EmptyPageGetStarted` foi removido com ele), `invalidateBasesForSpace`, estilos `.base-page-*` e `base-embed.css`. Fila `{base-queue}` e os jobs `BASE_*` do servidor. |
| Verificação de páginas | Selo e item de menu no cabeçalho, tela "Páginas verificadas", prefetch e item da barra de configurações. |
| Segurança e SSO | Tela "Segurança e SSO" (`/settings/security`), `getSsoProviders`, `IAuthProvider`. |
| Espaço pessoal | Item "Espaço pessoal"/"Criar espaço pessoal" no menu do usuário, `PersonalSpacesSetting` e os campos `allowPersonalSpaces`/`spaces.allowPersonal` do tipo do workspace. |
| Resolver comentário | "Resolver/Reabrir comentário" e o botão de resolução. A aba "Resolvidos" ficou sem sentido e saiu; a lista mostra só os comentários. Serviço `resolveComment` e tipo `IResolveComment` removidos. Comentar, responder, editar e apagar continuam. |
| Exportação PDF pelo ee | Rota `/pdf-render/:pageId` (`PdfRenderPage`) e, no servidor, os jobs `PDF_EXPORT_TASK`/`PDF_EXPORT_CLEANUP` que chamavam `ee/pdf-export`. A exportação PDF do núcleo (`integrations/export/pdf`) e o tema de PDF do workspace continuam. |
| Busca com IA | Modo "AI Answers" do spotlight, `useAiSearch`, `AiSearchResult`. Também saíram o filtro "Tipo" (só havia "Páginas" e "Anexos") e a busca de anexos (`/search-attachments`, `searchAttachments`, `IAttachmentSearch`): dependiam do Typesense empresarial. |
| Configurações de IA e MCP | Telas `/settings/ai` e `/settings/ai/mcp`, item "AI settings", `mcpEnabled`, `aiSearch` e `settings.ai.search/mcp` do tipo do workspace. |
| Restrição de página | Modal `PageShareModal` e `canManagePageShare` no cabeçalho da página. A permissão de leitura/edição no servidor continua. |
| Leitores comentarem | Aba "Segurança" das configurações do space (só tinha esse interruptor) e `SpaceSecuritySettings`. |
| Entitlements | `entitlementAtom`, `useEntitlements`, `useHasFeature`, `Feature`, `useFeatureDevelopmentLabel`, a carga no `UserProvider` e o endpoint `POST /workspace/entitlements`. Os botões que só existiam atrás de `useHasFeature` (importar DOCX, PDF e Confluence; filtro de anexos) saíram em vez de ficarem desabilitados. |

### Servidor: carregamentos opcionais removidos

Eram `require()` em `try/catch` de módulos que não existem. O comportamento do
núcleo é o mesmo de quando o `require` falhava:

- `app.module.ts`: `ee.module`.
- `license-check.service.ts`: agora só devolve "sem licença" (`hasFeature` é
  sempre `false`), sem `ModuleRef`. A interface continua porque `WorkspaceService`
  e `SpaceService` ainda a consultam. `common/features.ts` ficou com as três
  chaves que eles usam.
- `search.controller.ts`: ramo Typesense (e `SEARCH_DRIVER`/`TYPESENSE_*`, os
  getters, a fila `{search-queue}`, os jobs de busca e as chamadas dos
  listeners de página, space e workspace).
- Importação: DOCX e PDF (`ee/document-import`) e Confluence. `POST
  /pages/import` aceita só `.md` e `.html`; `POST /pages/import-zip` aceita só
  `generic` e `notion`.
- Anexos: `ee/attachments-ee` (indexação de PDF/DOCX) e os jobs
  `ATTACHMENT_INDEX_CONTENT`/`ATTACHMENT_INDEXING`, com os dois pontos que os
  enfileiravam.
- `notification.processor.ts`: `ee/page-verification` (job `VERIFICATION_RECONCILE`).
- `ws/base-realtime.bridge.ts`, com os ajustes em `ws.module.ts` e `ws.gateway.ts`
  (que deixou de tratar `handleDisconnect`, que só existia para a base).

### Chat e escrita assistida

Os dois foram reescritos fora do `ee/`: o chat em
`apps/client/src/features/assistant/` e a escrita assistida em
`apps/client/src/features/assisted-writing/` (ver D12 e D13 em
`03-decisoes.md`).

### O que ficou de propósito (código do núcleo)

- O campo `isBase` das páginas e o `getPageTitle(..., isBase, ...)`: são do
  modelo de dados do núcleo e inofensivos.
- `VerificationNotificationService` e os jobs de notificação de verificação e de
  aprovação no servidor, a tabela `page_verifications` do banco e o tipo de
  notificação de comentário resolvido: ficaram sem quem os dispare, mas o código
  é do núcleo AGPL. Removê-los exige migração e fica para uma etapa própria.
- `allowViewerComments` do space (leitura no cliente e no servidor): o servidor
  continua recusando a mudança sem licença, então vale `false`.
- A extensão `BaseEmbed` em `packages/editor-ext` (AGPL).

