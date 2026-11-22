# TCC — guia para agentes

Este repositório é o app do TCC. Antes de mexer, leia
`README.md` → `docs/tcc/README.md` → `docs/tcc/03-decisoes.md`. O serviço de
IA é o repositório irmão `../tcc-docs-ai` (neste checkout, `../As-docs-ai`),
com o seu próprio `AGENTS.md`.

## Regras do dono do projeto

- **Commit só quando o dono pedir.** Nada de configuração de git ou
  publicação por conta própria. Construa, teste e documente.
- Trabalhe **só** neste repositório e no serviço de IA irmão `tcc-docs-ai`
  (neste checkout, `As-docs-ai`).
- Não adicione ferramentas ou dependências novas, **exceto o Keycloak na
  stack Docker Compose local**, autorizado pelo dono para OIDC e OAuth 2.0
  Client Credentials (D14). Use as bibliotecas já declaradas nos
  `package.json` e no `pyproject.toml` da IA. Essa exceção não autoriza outros
  pacotes, ferramentas nem implantação AWS; qualquer ampliação exige nova
  autorização.
- A IA usa a chave própria da OpenAI do projeto, que o usuário pôs no `.env`
  (chmod 600). O compose repassa `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-6-luna`,
  `AI_EMBEDDING_PROVIDER=openai` e `AI_CHAT_PROVIDER=openai` ao serviço `ai`.
  **Nunca copie o valor da chave** para documentação, exemplos, testes, logs ou
  chat, e não use credenciais de outros projetos. Sem essas variáveis, a IA cai
  nos provedores `hashing`/`extractive`.
- Toda mudança ou decisão entra em `docs/tcc/` (no documento do assunto e, se
  for decisão, em `03-decisoes.md`).
- Português do Brasil em respostas e documentação.

## Invariantes do TCC

1. **Exatamente 2 usuários** (`core/tcc/tcc.constants.ts`), 1 workspace, 1 time
   e 1 space, criados por `TccSeedService` no boot. **É permitida a entrada
   OpenID Connect via Keycloak**, com Authorization Code e PKCE, exclusivamente
   para as duas identidades locais vinculadas a contas do provedor (D14 e
   `docs/tcc/09-plano-oauth2-oidc.md`). Não reintroduza cadastro aberto,
   convites, criação de time ou space, nem publicação. Não crie usuários
   automaticamente no callback OIDC.
2. **A sessão continua sendo a JWT de sempre**, com cookie `authToken` e
   registro em `user_sessions`, emitida por
   `SessionService.createSessionAndToken`. O fluxo atual usa
   `POST /api/auth/select-user`; a migração autorizada passa a emitir essa
   mesma sessão após o callback OIDC validado. Na entrega OIDC, desabilite a
   escolha pública de usuários e não a use como fallback se o provedor falhar.
   Não crie um mecanismo de autenticação paralelo: WebSocket, colaboração e
   permissões dependem da sessão existente. Tokens técnicos de serviço não
   podem substituí-la. O Clerk foi removido do código, das
   dependências e do banco; não o reintroduza. O mesmo vale para o diretório
   externo de clientes (cliente da página, propriedade `customer`), os modelos de
   página (templates) e os módulos billing, cloud, MFA, SCIM, auditoria e
   chaves de API, todos removidos do cliente, do servidor e do banco. A
   tabela `audit` continua só como histórico de labels (`LabelAuditService`):
   não a apague nem volte a gravar outros eventos nela.
3. **`pages.content_version` é responsabilidade do trigger** do Postgres. Não
   incremente a versão no código. `ai_indexed_version` só sobe
   (`GREATEST`).
4. **O indexador do app é o único escritor do índice vetorial.** Ele envia só a
   versão atual; a IA ignora versões repetidas ou menores.
5. **O MCP (`/mcp`) é somente leitura**, autenticado pela credencial delegada
   (audiência `tcc-docs-mcp`), e filtra pelas permissões do usuário
   (`accessiblePageCondition`). Tools: `docs.search_pages`,
   `docs.get_page_context` e `docs.read_page`. Uma tool nova também precisa
   entrar na allowlist do `tcc-docs-ai/src/tcc_docs_ai/mcp.py`.
6. **Somente o núcleo AGPL-3.0.** Não reintroduza código sob a *Docmost
   Enterprise License*: nada de pasta `ee/` (cliente, servidor ou `packages/`),
   de `packages/base-formula`, de `require('.../ee/...')` opcional nem de stub
   com esse nome. Recurso pago do Docmost sai; não se reimplementa copiando.
   Ver D13.
7. Os contratos com a IA (camelCase, eventos SSE e autenticação) ficam
   documentados em `tcc-docs-ai/docs/tcc/06-contratos.md` (neste checkout,
   `../As-docs-ai/docs/tcc/06-contratos.md`). **Está autorizada a substituição
   do HMAC app → IA por OAuth 2.0 Client Credentials**, cobrindo indexação,
   chat e escrita assistida, com validação de emissor, assinatura, validade,
   audiência, identidade técnica e escopos. Preserve a delegação MCP do item 5
   e o `APP_SECRET` usado pela sessão; não crie fallback automático para HMAC.
   Mudou de um lado, mude do outro. A primeira entrega é somente local.

## Onde está cada coisa

| Assunto | Caminho |
|---|---|
| Identidade fixa e seed | `apps/server/src/core/tcc/` |
| Entrar como usuário | `apps/server/src/core/auth/`, `apps/client/src/features/auth/` |
| Indexador, MCP e chat | `apps/server/src/integrations/tcc-ai/` |
| Escrita assistida | `apps/server/src/integrations/assisted-writing/`, `apps/client/src/features/assisted-writing/` |
| Chat no cliente | `apps/client/src/features/assistant/` |
| Migração de versão | `apps/server/src/database/migrations/20261002T120000-tcc-versioned-ai-index.ts` |
| Stack Docker / E2E | `docker-compose.yml`, `scripts/tcc-e2e.py` |
| Licença (só núcleo AGPL-3.0) | `LICENSE`, seção "Licença" do `README.md`, "Módulos da licença empresarial: removidos" em `docs/tcc/02-cortes-de-funcionalidade.md` e D13 em `docs/tcc/03-decisoes.md`. Checagem: `find . -path ./node_modules -prune -o -path ./.git -prune -o -type d -name ee -print` deve sair vazio e `grep -rn "Enterprise License" --exclude-dir=node_modules --exclude-dir=.git .` não deve achar nenhum `LICENSE` de pacote do repositório. |

## Verificação mínima de uma mudança

```bash
cd apps/server && npx tsc --noEmit -p tsconfig.json && npx jest
cd apps/client && npx tsc --noEmit && npx vitest run
```

Falhas que já existiam (não são regressão):
- servidor: `folder-import-processing.service.spec.ts`;
- cliente: 4 arquivos e 21 testes (`global-sidebar`, `docs-entry-redirect`,
  `docs-entry` e `assisted-writing/domain/session`).

Mudou algo no fluxo app↔IA? Rode o E2E (`docs/tcc/05-testes.md`):
`scripts/tcc-up.sh --build && python3 scripts/tcc-e2e.py`. Para parar:
`scripts/tcc-down.sh` (dados mantidos; `--apagar-dados` zera tudo).

## Armadilhas conhecidas

- O serviço `ai` fica pronto em cerca de 2,5 s (o vocabulário do tokenizer
  vem embutido na imagem). Se a IA estiver fora do ar, o indexador registra
  `fetch failed` e tenta de novo no próximo ciclo; o app não depende da IA para
  subir.
- O jest do servidor não tem `esModuleInterop`: use `require('postgres')` nos
  testes, e não `import postgres from`.
- `accessiblePageCondition` precisa dos parênteses externos (ver D7 em
  `docs/tcc/03-decisoes.md`). Sem eles, filtros encadeados vazam.
- O arquivo `db.d.ts` é gerado (`migration:codegen`), mas foi ajustado à mão
  (colunas novas e tabelas removidas). Se regenerar, confira o diff.
- `docker compose` precisa do `../tcc-docs-ai` ao lado deste repositório (ou de
  `TCC_DOCS_AI_PATH`).

---

# Instruções de internacionalização

Todo conteúdo que possa ser lido pelo usuário final — incluindo textos, botões,
placeholders, tooltips, confirmações, estados vazios, mensagens de notificação,
acessibilidade e erros — deve:

- usar `react-i18next` em vez de texto literal na interface;
- adicionar a chave ao `en-US` e sua tradução ao `pt-BR` na mesma alteração;
- considerar os 12 idiomas selecionáveis e o fluxo do Crowdin;
- manter exatamente os mesmos parâmetros `{{...}}` em todos os idiomas;
- nunca exibir diretamente mensagens recebidas do backend; mensagens conhecidas
  devem ser traduzidas e mensagens desconhecidas devem usar um fallback da operação;
- ser verificado, no mínimo, em inglês e português antes da conclusão.

`en-US` é o locale-fonte e fallback do Crowdin. Os outros dez locales não devem
receber traduções automáticas improvisadas nesta base; sua atualização ocorre
por meio do Crowdin e, até a sincronização, eles usam o fallback em inglês.

# Commits

Títulos e descrições em português do Brasil, no formato
`<tipo>(<escopo>): <mensagem curta>` (tipos: `feat`, `fix`, `refactor`,
`test`, `docs`, `chore`). Identificadores técnicos, comandos e nomes de
arquivos podem ficar como estão.
