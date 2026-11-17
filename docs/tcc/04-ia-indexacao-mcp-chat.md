# IA: versão, indexação, MCP e chat

Todo o código fica em `apps/server/src/integrations/tcc-ai/`.

| Arquivo | Responsabilidade |
|---|---|
| `tcc-ai.module.ts` | Registra controllers e serviços (e um `JwtModule` próprio para a credencial MCP). |
| `ai-signing.ts` | Assinatura HMAC idêntica à de `tcc-docs-ai/src/tcc_docs_ai/auth.py`. |
| `page-markdown.ts` | Conteúdo ProseMirror → Markdown (o mesmo caminho da exportação), com fallback para texto puro. |
| `ai-indexing.service.ts` | Indexador versionado. |
| `mcp-credential.service.ts` | Emite e valida a credencial MCP delegada. |
| `docs-read.service.ts` | As leituras expostas pelo MCP, sempre com as permissões do usuário. |
| `docs-mcp.controller.ts` | Servidor MCP em `/mcp`. |
| `ai-chat.service.ts` / `ai-chat.controller.ts` | Chat em `/api/ai/chats/*`. |
| `sse-parser.ts` | Parser incremental do SSE da IA. |

## Versão das páginas

- Migração `20261002T120000-tcc-versioned-ai-index.ts`.
- O trigger `pages_content_version_trigger` incrementa `content_version` quando
  `title`, `content` ou `deleted_at` mudam. Também reverte qualquer escrita
  direta em `content_version` e impede `ai_indexed_version` de diminuir.
- Pendente = `ai_indexed_version < content_version` (índice parcial
  `pages_ai_index_pending_idx`).

## Indexador

1. `findPending()`: até 20 páginas pendentes, das mais antigas para as mais
   novas.
2. Agrupa por workspace (tenant) e faz `POST {DOCS_AI_URL}/v1/index/pages` com
   `{pageId, version: content_version, title, spaceId, text: markdown, deleted}`.
   Uma página na lixeira vai como lápide (`deleted: true`, `text: ""`).
3. Para cada resultado confirmado (`indexed`, `already_indexed` ou
   `older_than_latest`), executa
   `ai_indexed_version = GREATEST(ai_indexed_version, version)`.
4. Se a IA falhar, nada é marcado e o próximo ciclo tenta de novo.

Disparo: `setInterval(DOCS_AI_INDEX_INTERVAL_SECONDS)`, com `0` desligando, e
`POST /api/ai/chats/index/run`.

## Servidor MCP (`/mcp`)

- Streamable HTTP sem sessão (`enableJsonResponse`). Cada requisição é
  autenticada pelo Bearer e atendida por um `McpServer` novo, já preso ao
  usuário da credencial.
- As tools não recebem identidade nem workspace como argumento:

| Tool | Retorno |
|---|---|
| `docs.search_pages {query, limit≤10}` | Páginas cujo título ou texto **atual** contém as palavras da pergunta (sem acento, palavras com mais de 3 letras). |
| `docs.get_page_context {pageIds≤20}` | `version` (= `content_version`), `indexedVersion`, `deleted` e `updatedAt`. |
| `docs.read_page {pageId}` | `{version, markdown (≤60k), truncated}`. Página inacessível → `isError`. |

- `DOCS_AI_MCP_ENABLED=false` faz `/mcp` responder 404. Sem MCP, a IA responde
  só pelo índice.

## Chat (`/api/ai/chats/*`)

| Rota | Função |
|---|---|
| `POST /ai/chats` | Lista as conversas do usuário. |
| `POST /ai/chats/info` | Conversa + mensagens. |
| `POST /ai/chats/search` | Busca por título. |
| `POST /ai/chats/update` / `delete` | Renomeia / exclui (soft delete). |
| `POST /ai/chats/send` | Pergunta. Resposta em SSE (`data: {...}`). |
| `POST /ai/chats/index/run` | Roda um ciclo do indexador agora. |

Eventos de `send`, na ordem:

| Evento | Quando |
|---|---|
| `chat_created {chatId}` | Primeira pergunta de uma conversa nova. |
| `freshness {stalePages, checked}` | Sempre. `stalePages` lista as páginas cujo índice estava atrás do app. |
| `sources {sources}` | Há evidência. Cada fonte traz `n`, `origin` (`index`/`mcp_read`), `version`, `slugId` e `spaceSlug`. |
| `content {text}` | Texto da resposta. |
| `not_found {similar}` | A IA não encontrou a resposta nos documentos. |
| `done {messageId, found}` | Fim. A mensagem do assistente fica gravada com `metadata = {found, sources, similar, stalePages}`. |
| `error {code, message, retryable}` | Falha (por exemplo `ai_unavailable`). |

O histórico enviado à IA usa as últimas 10 mensagens da conversa. A página
aberta no painel lateral (ou a primeira página mencionada com `@`) vai como
`contextPageId`.

## Cliente

- O chat é código novo (AGPL) em `apps/client/src/features/assistant/`, no
  lugar do antigo `ee/ai-chat` (licença Docmost Enterprise). Páginas:
  `/home` e `/home/chat/:chatId` (`pages/assistant-page.tsx`); `/ai` e
  `/ai/chat/:chatId` redirecionam. Histórico na barra lateral
  (`components/sidebar-conversations.tsx`) e painel ao lado da página
  (`components/aside-assistant-panel.tsx`, envia `contextPageId`).
- `services/assistant-service.ts` (`streamAnswer`, com `utils/sse-parser.ts`) e
  `hooks/use-assistant-chat.ts` (reducer em `utils/conversation-state.ts`)
  consomem os eventos acima.
- `metadata` das mensagens chega do servidor como string JSON; o cliente
  decodifica ao carregar o histórico.
- `components/answer-details.tsx` mostra:
  - o aviso de documento desatualizado ("indexada vX, atual vY");
  - as fontes numeradas com link (e "versão atual vN" quando vieram do MCP);
  - o bloco "Não encontrei isso nos documentos", com as páginas semelhantes.
- As strings ficam em `public/locales/{en-US,pt-BR}/translation.json`.

## Escrita assistida

O painel é o componente `AssistedWritingPanel`
(`apps/client/src/features/assisted-writing/`), código novo fora de `ee/`
(D12 em `03-decisoes.md`). Fluxo:

1. No editor, o botão flutuante "Escrita assistida" (ou "Pedir à IA sobre
   seleção") abre o painel.
2. O cliente serializa os blocos de topo com o hash SHA-256 do JSON canônico
   (`features/assisted-writing/domain/assisted-writing.ts`) e envia para
   `POST /api/ai/assisted-writing/stream`.
3. O servidor confere permissão de edição, monta o índice de páginas do space
   (para links) e assina a chamada para `/v1/generations/stream` na IA.
4. O painel mostra cada operação como "antes/depois". "Aceitar seguras" aplica
   só as operações cujo `baseHash` ainda bate com o documento; a aplicação vira
   uma versão no histórico (`/ai/assisted-writing/version`) e pode ser
   desfeita.
5. Quando a IA decide não alterar nada (pergunta, informação ausente da
   página), o painel mostra "Nenhuma alteração proposta" com o motivo dado pela
   IA, e a pergunta fica no histórico da sessão.

Ajustes desta etapa (testados no editor com o `gpt-6-luna`):
- os rótulos das propostas mostram o tipo do bloco em português ("Alterar
  parágrafo", "Inserir lista numerada após …") em vez do id interno
  (`features/assisted-writing/domain/operation-label.ts`);
- `done.noChangeReason` substitui o "Algo deu errado" que aparecia quando a IA
  não tinha o que alterar;
- o aviso do painel diz "A IA pode cometer erros".

