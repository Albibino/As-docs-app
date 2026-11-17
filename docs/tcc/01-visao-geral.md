# Visão geral

O app é um editor de documentação colaborativo (NestJS + Fastify + Kysely no
servidor; React + Mantine + Tiptap/Yjs no cliente; monorepo pnpm + Nx). Para o
TCC ele foi reduzido ao essencial e ganhou a integração com a IA.

## O que existe

- **2 usuários fixos:** "Usuário 1" e "Usuário 2". Não há login: a tela inicial
  pede para escolher um dos dois. Para editar juntos, abra uma janela (ou um
  navegador) para cada usuário.
- **1 workspace** ("TCC Docs"), **1 time** ("Time TCC") e **1 space**
  ("Documentos"), criados automaticamente no boot.
- **Edição simultânea** em tempo real (Hocuspocus/Yjs), comentários, histórico
  de versões, busca, labels, bases e exportação. Tudo isso foi mantido como
  estava.
- **IA:**
  - *Conversa / tirar dúvidas* (`/ai` e o painel lateral da página): responde
    só com base nos documentos, cita as fontes, avisa quando um documento
    mudou depois de indexado e diz "não encontrei" com as páginas semelhantes;
  - *Escrita assistida* dentro do editor (fluxo original, temperatura 0).

## Fluxo de dados

```
 Usuário 1 / Usuário 2 (navegador)
            │ cookie authToken (JWT)
            ▼
 tcc-docs-app ──────────── Postgres
   │   pages.content_version  (trigger: +1 a cada mudança de conteúdo)
   │   pages.ai_indexed_version (maior versão confirmada no índice)
   │
   ├─ AiIndexingService ──HMAC──► tcc-docs-ai  POST /v1/index/pages
   │    (a cada 30 s ou /api/ai/chats/index/run)
   │
   ├─ /api/ai/chats/send ──HMAC + credencial MCP──► tcc-docs-ai POST /v1/chat/stream
   │                                                   │
   └─ /mcp (somente leitura) ◄──── Bearer ─────────────┘
        docs.search_pages · docs.get_page_context · docs.read_page
```

O cenário central do TCC:
1. A página está na v1 no índice vetorial.
2. Alguém edita e ela passa a v2 no app; o indexador ainda não rodou.
3. A IA compara as versões pelo MCP, percebe a diferença e lê a v2 com
   `docs.read_page`.
4. A resposta usa o conteúdo atual, e a interface mostra o aviso
   "indexada v1, atual v2".

Esse cenário é coberto de ponta a ponta por `scripts/tcc-e2e.py`.
