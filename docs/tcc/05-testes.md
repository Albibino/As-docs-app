# Testes

## Servidor (`apps/server`)

```bash
cd apps/server
npx tsc --noEmit -p tsconfig.json
npx jest

# Integração com Postgres real (trigger de versão, seed, leituras MCP):
docker run -d --name tcc-it-pg -e POSTGRES_DB=tcc -e POSTGRES_USER=tcc \
  -e POSTGRES_PASSWORD=tcc-test -p 55433:5432 postgres:18
DATABASE_URL=postgresql://tcc:tcc-test@localhost:55433/tcc npx tsx src/database/migrate.ts latest
TCC_TEST_DATABASE_URL=postgresql://tcc:tcc-test@localhost:55433/tcc npx jest src/integrations/tcc-ai
```

Sem `TCC_TEST_DATABASE_URL`, a suíte `tcc-postgres.integration.spec.ts` é
pulada.

| Suíte | Cobre |
|---|---|
| `integrations/tcc-ai/tcc-postgres.integration.spec.ts` | Seed idempotente (exatamente 1 workspace, 1 time, 1 space, 2 usuários); trigger de versão (conteúdo incrementa, metadado não, escrita direta é ignorada); marcador de indexação nunca regride; lista de pendentes; leituras MCP vendo a v3 com o índice na v2; página inacessível. |
| `integrations/tcc-ai/docs-mcp.controller.spec.ts` | Allowlist exata das tools (somente leitura) e retorno do `docs.read_page`/`get_page_context` com um cliente MCP real (`InMemoryTransport`). |
| `integrations/tcc-ai/ai-chat.service.spec.ts` | Envio da credencial MCP e do `contextPageId`; tradução do SSE; "não encontrado" sem texto; erro sem gravar resposta. |
| `integrations/tcc-ai/ai-indexing.service.spec.ts` | Só a versão atual vai em Markdown; lápide; assinatura; marcador não avança com a IA fora do ar. |
| `integrations/tcc-ai/ai-signing.spec.ts` | Assinatura idêntica à do Python (vetor gerado por `tcc_docs_ai.auth.sign_request`). |
| `integrations/tcc-ai/mcp-credential.service.spec.ts` | Credencial com audiência própria; token de sessão comum é recusado. |
| `core/auth/*.spec.ts` | Só `usuario-1`/`usuario-2` entram; cookie de sessão emitido. |
| `database/tcc-cleanup-migrations.integration.spec.ts` | Migrações que removem o Clerk e o diretório externo, aplicadas sobre um banco antigo com dados (usa um banco descartável `tcc_cleanup_migrations_test`). |

Falhas que já existiam antes do TCC (não relacionadas):
`integrations/import/services/folder-import-processing.service.spec.ts` (erro de
tipo em `SvgMediaOptions`).

## Cliente (`apps/client`)

```bash
cd apps/client
npx tsc --noEmit
npx vitest run
```

Testes novos do chat (`features/assistant/`): `utils/sse-parser.test.ts`,
`services/assistant-service.test.ts`, `utils/conversation-state.test.ts`,
`hooks/use-assistant-chat.test.tsx`, `components/answer-details.test.tsx`,
`components/sidebar-conversations.test.tsx` e
`components/aside-assistant-panel.test.tsx`. O
`history-modal-layout.test.tsx` foi ajustado: verifica que a publicação **não**
aparece.

Falhas que já existiam antes do TCC (4 arquivos, 21 testes, ambiente de
teste): `global-sidebar`, `docs-entry-redirect`, `docs-entry` e
`assisted-writing/domain/session` (`localStorage` do Node e mock do `jotai`). O
`full-editor.test.tsx`, que também falhava, voltou a passar depois da remoção
do `PageCustomer`: o componente puxava `atom` de um mock do `jotai` que não o
exportava.

Painel de escrita assistida: `features/assisted-writing/components/assisted-writing-panel.test.tsx`
(abrir, enviar pedido com o serviço mockado, proposta antes/depois, aceitar,
recusar, desfazer, motivo de "nenhuma ação" e erro) e
`domain/safe-revert.test.ts`. No navegador: `scripts/tcc-assisted-writing-ui.cjs`.

## Ponta a ponta (`scripts/tcc-e2e.py`)

Roda contra a stack do `docker-compose.yml`, só com a biblioteca padrão do
Python:

```bash
cp .env.example .env     # preencha APP_SECRET e DOCS_AI_HMAC_SECRET
docker compose up -d --build
python3 scripts/tcc-e2e.py http://localhost:3001
```

O script percorre os passos:
1. Identidade fixa e o único space.
2. Página v1 indexada.
3. Resposta vinda do índice.
4. Usuário 2 edita (v2) sem reindexar.
5. **A IA detecta "indexada v1, atual v2", a fonte vem de `docs.read_page`
   (`mcp_read`) e a resposta usa a v2.** Nenhum trecho antigo da página entra
   na resposta.
6. Pergunta sem resposta: `not_found` e nenhum texto.
7. A indexação incremental leva o índice à v2, uma segunda execução não
   reindexa nada e a resposta passa a vir do índice na versão nova.

O script repete a indexação por até 3 minutos, caso o serviço de IA ainda
esteja subindo (normalmente cerca de 2,5 s). Resultado esperado: `E2E OK`.

**Funciona com e sem chave.** Cada execução usa prazos exclusivos (função
`unique_days`, ex.: v1 = 290 dias, v2 = 790 dias) e confere que a resposta
traz o prazo novo e não traz o antigo. Isso é necessário com o modelo real: ele
lista o que cada página parecida diz ("as políticas A e B exigem 45 dias; a C,
30 dias") e agrupa as citações de jeitos diferentes. Com prazos fixos, páginas
de execuções anteriores contaminavam a checagem. Em caso de falha, o script
mostra a resposta e as fontes (`detalhe:`).

### Escrita assistida no navegador (`scripts/tcc-assisted-writing-ui.cjs`)

Usa o `playwright-core` que já é dependência do `apps/server` e o Chromium do
cache do Playwright:

```bash
TCC_CHROMIUM=~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome \
  node scripts/tcc-assisted-writing-ui.cjs http://localhost:3001
```

Passos: escolhe "Usuário 1"; cria uma página com erros de ortografia; abre o
painel, pede a correção e confere a proposta ("Alterar parágrafo", texto
corrigido); aceita e confere o editor e o banco; desfaz e confere o texto
original; pergunta "Qual é a capital da França?" e confere que nada muda, que
o painel explica o motivo e que a pergunta fica no histórico; e que não houve
nenhum 401 depois da escolha do usuário. Capturas de tela vão para
`$TCC_SHOTS` (padrão `./tcc-shots`). Resultado esperado: `UI OK`.

Execuções verificadas com `gpt-6-luna` + `text-embedding-3-small`: 1 num banco
zerado e 5 seguidas num banco com páginas parecidas de execuções anteriores,
todas `E2E OK`. No modo sem chave (`hashing`/`extractive`), banco zerado:
`E2E OK`.
