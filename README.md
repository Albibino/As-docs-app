# As-docs-app

Versão do tcc-docs-app preparada para a AWS (trabalho de Auditoria e Segurança de Sistemas),
separada em **frontend** (Nginx, EC2 em subnet pública) e **backend** (NestJS, EKS em subnet privada).

| Pasta | Conteúdo |
|---|---|
| `frontend/` | Dockerfile + Nginx (estáticos, proxy `/api` `/socket.io` `/collab` → `BACKEND_URL`) |
| `backend/` | Dockerfile só da API |
| `deploy/ec2/` | compose e user-data das EC2 do frontend |
| `deploy/k8s/` | namespace, Redis 8, backend (ConfigMap, Secret, NLB interno, NetworkPolicy) |
| `docker-compose.yml` | stack local com a mesma separação (abre em http://localhost:8080) |

Passo a passo de nuvem: [`deploy/README.md`](deploy/README.md).

---

# tcc-docs-app

App de documentação colaborativa do TCC. Tem dois usuários
fixos ("Usuário 1" e "Usuário 2"), que entram sem login. Há um único workspace,
um único time e um único space, e a edição em tempo real continua funcionando.
A IA (repositório irmão [`tcc-docs-ai`](../tcc-docs-ai)) conversa e tira
dúvidas sobre os documentos e oferece escrita assistida.

O ponto central é a IA sobre um **índice vetorial versionado**:
- toda alteração gera uma nova versão da página;
- só versões novas são indexadas;
- quando o índice está atrás do app, a IA lê a página atual pelo MCP
  (`docs.read_page`) antes de responder.

Documentação completa em [`docs/tcc/`](docs/tcc/README.md). Orientações para
agentes em [`AGENTS.md`](AGENTS.md).

## Como executar

Com Docker (app + IA + Postgres + Redis 8):

```bash
cp .env.example .env
sed -i "s/^APP_SECRET=.*/APP_SECRET=$(openssl rand -hex 32)/" .env
sed -i "s/^DOCS_AI_HMAC_SECRET=.*/DOCS_AI_HMAC_SECRET=$(openssl rand -hex 32)/" .env
docker compose up --build
```

Abra `http://localhost:3001` e escolha um usuário. Para editar junto, abra outra
janela com o outro usuário.

Teste ponta a ponta (com a stack no ar):

```bash
python3 scripts/tcc-e2e.py http://localhost:3001
```

Publicação no Railway: [`docs/tcc/06-docker-e-railway.md`](docs/tcc/06-docker-e-railway.md).

## Recursos mantidos

- Colaboração em tempo real
- Diagramas com Draw.io, Excalidraw e Mermaid
- Comentários e histórico de versões
- Busca, anexos, incorporações e exportação
- Interface traduzida para vários idiomas

Removidos para o TCC: login, convites, publicação e compartilhamento público,
criação de times e spaces. Ver [`docs/tcc/02-cortes-de-funcionalidade.md`](docs/tcc/02-cortes-de-funcionalidade.md).

## Licença

Este projeto é distribuído sob a **GNU Affero General Public License v3.0**
(AGPL-3.0); o texto completo está em [LICENSE](LICENSE).

Ele é derivado do [Docmost](https://github.com/docmost/docmost), de
Docmost, Inc. O aviso **Copyright (c) Docmost, Inc.** e a atribuição ao código
original são preservados. Só o núcleo AGPL-3.0 do Docmost faz parte deste
repositório: o código sob a *Docmost Enterprise License* (as pastas `ee/` e o
pacote de fórmulas de bases) foi removido e não pode voltar. Ver
[`docs/tcc/02-cortes-de-funcionalidade.md`](docs/tcc/02-cortes-de-funcionalidade.md)
e a decisão D13 em [`docs/tcc/03-decisoes.md`](docs/tcc/03-decisoes.md).

O chat e a escrita assistida foram escritos para o TCC (AGPL-3.0), fora do
código empresarial.

## Licenças de terceiros

Os arquivos `LICENSE` incluídos em subdiretórios (dependências e assets de
terceiros) são mantidos sem alterações para preservar as atribuições do código
original.
