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

