# Roteiro de teste manual

Para testar o sistema pela interface, como um usuário. Leva uns 15 minutos.
Os testes automáticos estão em `05-testes.md`.

## Preparar

```bash
cd ~/Projetos/tcc-docs-app
scripts/tcc-up.sh --seed       # sobe app, IA, Postgres e Redis e cria 3 páginas de exemplo
```

Abra **http://localhost:3001**.

Para começar do zero (apaga tudo, inclusive o índice):

```bash
scripts/tcc-down.sh --apagar-dados && scripts/tcc-up.sh --seed
```

Ver a seção "Scripts" em `06-docker-e-railway.md` para build e parada.

Páginas criadas: **Política de férias** (30 dias de antecedência, até 3
períodos, aprovação em 5 dias úteis), **Reembolso de despesas** (refeição
R$ 80/dia, hospedagem R$ 350/noite) e **Onboarding** (com um parágrafo cheio
de erros, de propósito).

## 1. Usuários e colaboração

1. Escolha **Usuário 1**. Não há login nem senha.
2. Abra uma janela anônima (ou outro navegador) e escolha **Usuário 2**.
3. Abra a mesma página nas duas janelas e digite nas duas.

**Esperado:** o texto de um aparece na tela do outro em tempo real, com o
cursor identificado. Existe um só space ("Documentos") e não há tela de
convite, publicação ou login.

## 2. Perguntas à IA

Abra o **Chat com IA** (botão no topo, à direita) e pergunte:

| Pergunta | Esperado |
|---|---|
| Com quantos dias de antecedência devo pedir férias? | 30 dias, com a fonte "Política de férias". |
| Qual o limite de reembolso para hospedagem? | R$ 350 por noite. |
| Posso dividir minhas férias? | Até três períodos, um com pelo menos 14 dias. |
| Qual é o valor do vale-refeição? | "Não encontrei" e uma lista de páginas semelhantes. Nada inventado. |

Clique numa fonte: ela abre a página citada.

## 3. Documento desatualizado no índice (cenário principal)

O indexador roda a cada 30 s. Para ver a IA detectar a defasagem, faça os
passos 2 e 3 em menos de 30 s depois de salvar (ou pare o indexador; ver
abaixo).

1. Abra **Política de férias** e troque "30 dias" por **"45 dias"**.
2. No chat, logo em seguida, pergunte de novo: *Com quantos dias de
   antecedência devo pedir férias?*

**Esperado:** aviso de que a página está desatualizada no índice ("indexada
v1, atual v2"), a fonte marcada como versão atual (lida pelo MCP
`docs.read_page`) e a resposta **45 dias**.

3. Espere 30 s e pergunte de novo.

**Esperado:** sem aviso de defasagem e resposta 45 dias, agora vinda do índice
(na versão 2). A versão 1 continua guardada; nada foi reindexado.

Para fazer esse teste com calma, desligue o indexador automático antes:

```bash
DOCS_AI_INDEX_INTERVAL_SECONDS=0 docker compose up -d app
```

Depois de ver o aviso de defasagem, indexe quando quiser com
`python3 scripts/tcc-seed-demo.py` (ele roda o indexador até ficar em dia) e
pergunte de novo. Para voltar ao indexador automático:
`docker compose up -d app`.

## 4. Escrita assistida

1. Abra **Onboarding**.
2. Clique no botão flutuante **Escrita assistida** (canto inferior direito).
3. Peça: *Corrija a ortografia e a pontuação do parágrafo do primeiro dia.*

**Esperado:** uma proposta "Alterar parágrafo" com o texto antigo riscado e o
novo em verde. **Aceitar seguras** aplica; **Desfazer aplicação IA** volta.

Outros pedidos para testar:

| Pedido | Esperado |
|---|---|
| Transforme o primeiro dia numa lista de passos. | Remove o parágrafo e insere uma lista. |
| Sugira um título melhor para esta página. | "Renomear página para …". |
| Selecione um trecho e use **Pedir à IA sobre seleção**. | A proposta mexe só no trecho. |
| Qual é a capital da França? | "Nenhuma alteração proposta", com o motivo. O documento não muda. |
| Acrescente o horário de início do expediente. | "Nenhuma alteração proposta": a informação não está na página. |

## Se algo der errado

```bash
docker compose ps                      # os 4 serviços devem estar "healthy"/"Up"
docker compose logs --tail 50 ai       # erros da IA (chave, modelo, Redis)
docker compose logs --tail 50 app      # erros do app (indexador, MCP)
```

- **A IA responde "não encontrei" para tudo:** o índice ainda não foi
  preenchido. Rode `python3 scripts/tcc-seed-demo.py`.
- **Erro de IA indisponível:** confira `OPENAI_API_KEY` no `.env` do
  `tcc-docs-app` e `docker compose logs ai`.
- **Respostas copiando trechos, sem texto próprio:** a IA está no modo sem chave
  (`AI_CHAT_PROVIDER=extractive`). Confira o `.env`.
