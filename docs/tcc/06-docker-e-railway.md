# Docker e Railway

## Local: stack completa

`docker-compose.yml` sobe quatro serviços:

| Serviço | Imagem | Observação |
|---|---|---|
| `app` | `Dockerfile` deste repositório | Porta 3001. Roda as migrações e o seed no boot. |
| `ai` | `${TCC_DOCS_AI_PATH:-../tcc-docs-ai}` | Construído a partir do repositório irmão. Sem porta exposta. |
| `db` | `postgres:18` | Com healthcheck; o app espera ele ficar pronto. |
| `redis` | `redis:8` | DB 0 = IA (índice vetorial + idempotência); DB 1 = app. |

```bash
cp .env.example .env
# gere os dois segredos:
sed -i "s/^APP_SECRET=.*/APP_SECRET=$(openssl rand -hex 32)/" .env
sed -i "s/^DOCS_AI_HMAC_SECRET=.*/DOCS_AI_HMAC_SECRET=$(openssl rand -hex 32)/" .env
docker compose up --build
```

Abra `http://localhost:3001`, escolha "Usuário 1" e, em outra janela, "Usuário
2". Sem chave, a IA usa os provedores `hashing`/`extractive`. Para usar a
OpenAI, acrescente ao `.env` `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-6-luna`,
`AI_EMBEDDING_PROVIDER=openai` e `AI_CHAT_PROVIDER=openai`. Ao trocar o
provedor de embedding num banco que já existe, zere o marcador para o indexador preencher o índice novo. O trigger
impede que `ai_indexed_version` diminua, então ele precisa ser desligado só
nesse comando:

```sql
BEGIN;
ALTER TABLE pages DISABLE TRIGGER pages_content_version_trigger;
UPDATE pages SET ai_indexed_version = 0;
ALTER TABLE pages ENABLE TRIGGER pages_content_version_trigger;
COMMIT;
```

Sem Docker, rode Postgres e Redis 8 por fora, `pnpm install`, `pnpm dev` (app)
e `uv run uvicorn tcc_docs_ai.app:create_app --factory --port 8000` no `tcc-docs-ai`,
com `DOCS_AI_URL=http://localhost:8000` no app e
`AI_MCP_SERVER_URL=http://localhost:3000/mcp` na IA.

## Scripts (local)

Três scripts em `scripts/`, que funcionam de qualquer pasta e nunca mostram os
valores do `.env`:

| Script | O que faz |
|---|---|
| `scripts/tcc-build.sh` | Constrói as imagens do app e da IA (`--app` ou `--ia` para só uma; `--sem-cache` para build do zero). |
| `scripts/tcc-up.sh` | Sobe app, IA, Postgres e Redis e espera todos ficarem saudáveis. `--build` constrói antes; `--seed` cria as páginas de exemplo. |
| `scripts/tcc-down.sh` | Derruba tudo e mantém os dados. `--apagar-dados` apaga banco, índice e arquivos (pede para digitar "apagar"; `--sim` pula a confirmação). |

Antes de qualquer coisa, os scripts conferem: Docker rodando, `.env` com
`APP_SECRET` e `DOCS_AI_HMAC_SECRET`, repositório da IA em `TCC_DOCS_AI_PATH`
e, se a IA estiver no modo OpenAI, `OPENAI_API_KEY` preenchido. O
`tcc-up.sh` não constrói imagens por conta própria: sem imagem local, ele
avisa para rodar o build.

Fluxo comum depois de mudar código:

```bash
scripts/tcc-build.sh && scripts/tcc-up.sh
```

As funções compartilhadas ficam em `scripts/tcc-common.sh`.

## Railway

Arquivos: `railway.toml` (app) e `tcc-docs-ai/railway.toml` (IA). Os dois
constroem pelo `Dockerfile`.

Serviços no mesmo ambiente do projeto Railway:

1. **`tcc-docs-app`** (este repositório). Healthcheck `/api/health/live`.
   Gere um domínio público.
2. **`tcc-docs-ai`** (repositório irmão). Healthcheck `/health/ready`. Sem
   domínio público, só na rede privada.
3. **`Postgres`** (gerenciado).
4. **`Redis`** na versão **8 ou mais nova** (Vector Sets). Se o template
   gerenciado for anterior, crie um serviço a partir da imagem `redis:8`, com
   volume em `/data` e o comando `redis-server --appendonly yes`. O app e a IA
   podem compartilhar o mesmo Redis em DBs diferentes (`/1` e `/0`).

Variáveis do `tcc-docs-app`:

```text
APP_URL=https://<dominio>.up.railway.app
NODE_ENV=production
APP_SECRET=<openssl rand -hex 32>
JWT_TOKEN_EXPIRES_IN=30d
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}/1
STORAGE_DRIVER=local
MAIL_DRIVER=log
DISABLE_TELEMETRY=true
DOCS_AI_URL=http://${{tcc-docs-ai.RAILWAY_PRIVATE_DOMAIN}}:8000
DOCS_AI_HMAC_SECRET=<mesmo valor da IA>
DOCS_AI_MCP_ENABLED=true
DOCS_AI_INDEX_INTERVAL_SECONDS=30
```

Variáveis do `tcc-docs-ai`: ver `tcc-docs-ai/docs/tcc/08-docker-e-railway.md`.
O ponto de atenção é
`AI_MCP_SERVER_URL=http://${{tcc-docs-app.RAILWAY_PRIVATE_DOMAIN}}:${{tcc-docs-app.PORT}}/mcp`.

Com `STORAGE_DRIVER=local`, anexe um volume em `/app/data/storage` no serviço
do app para os uploads sobreviverem a novos deploys.

> Nada foi publicado. Estes arquivos deixam o deploy pronto para quando o dono
> do projeto decidir publicar.
