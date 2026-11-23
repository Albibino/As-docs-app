# Plano de adoção de OAuth 2.0 e OpenID Connect

**Estado:** o login OIDC e o modo Client Credentials estão implementados
no app e na IA. Consulte [10-keycloak-local.md](10-keycloak-local.md) para
provisionar e ativar os dois fluxos, que têm flags independentes. HMAC continua
como modo padrão e opção de rollback explícito; não há fallback em OAuth.
As mudanças se limitam ao Compose local, sem mudanças na AWS.

## 1. Objetivo e referência

Adotar dois fluxos distintos:

- **Usuários:** OpenID Connect (OIDC), com Authorization Code e PKCE S256.
- **Backend → IA:** OAuth 2.0 Client Credentials, substituindo a assinatura
  HMAC das requisições por access tokens técnicos.

Referência fornecida: `docs/Projeto_Pedro_Henrique_Scheidt.pdf`,
*Desenvolvimento de um modelo de autenticação e autorização entre
microsserviços*, de Pedro Henrique Scheidt. As seções 4.4.1–4.4.5 e 4.7
fundamentam a separação entre usuário e cliente técnico, Keycloak, audiência,
escopo, identidade do cliente e validação local. O PDF está disponível
localmente e é ignorado pelo Git; este plano não altera essa condição.

O trabalho descreve um laboratório de Hotel/Reservas e informa que não houve
execução integrada na coleta. Aproveitaremos os mecanismos, não as regras de
negócio, as credenciais de exemplo ou as concessões do laboratório. A entrega
deste projeto deverá ter testes integrados próprios.

## 2. Diagnóstico do projeto

| Ponto atual | Consequência para a mudança |
|---|---|
| `POST /api/auth/select-user` escolhe uma das duas identidades sem verificar credenciais. | OIDC exige substituir essa entrada; mantê-la pública seria um desvio completo do login. |
| `SessionService.createSessionAndToken` cria `user_sessions` e o cookie JWT `authToken`. | Preservar esse mecanismo para REST, Socket.IO e colaboração. |
| `TccSeedService` mantém dois usuários, um workspace, um time e um space. | Não criar usuários automaticamente no retorno do OIDC. |
| `ai-signing.ts` assina indexação e chat. | Migrar ambos para um cliente OAuth compartilhado. |
| `AssistedWritingService.buildSignedRequest` implementa HMAC separadamente. | Migrar também a escrita assistida; trocar apenas `ai-signing.ts` seria incompleto. |
| A IA autentica todas as rotas `/v1/*` em `auth.py`/`app.py`. | Substituir a dependência HMAC e acrescentar autorização por rota. |
| A identidade HMAC participa do isolamento da idempotência. | Derivar a identidade de claims verificados; preservar estabilidade durante renovação de tokens. |
| `/mcp` usa JWT delegado curto, audiência `tcc-docs-mcp` e permissões do usuário. | Não substituir essa delegação por uma identidade técnica com acesso global. |
| A stack AWS mantém a IA privada, mas usa HTTP em trechos internos. | Resolver proteção de transporte para Bearer tokens antes de alegar prontidão para produção. |

O serviço irmão existente neste checkout chama-se `../As-docs-ai`, conforme o
Compose e os READMEs atuais. Parte da documentação e dos scripts ainda usa
`tcc-docs-ai`/`TCC_DOCS_AI_PATH`; o Compose usa `AS_DOCS_AI_PATH` e porta 8080.
A implementação deverá harmonizar as instruções e os scripts necessários ao
teste, sem criar outro serviço de IA.

## 3. Escopo confirmado e condições para iniciar

### 3.1 Definições confirmadas pelo dono

- **Provedor:** Keycloak, conforme o trabalho científico; não criar um
  servidor OAuth próprio.
- **Identidades:** manter exatamente os dois usuários locais atuais,
  vinculados a duas contas do Keycloak. Sem cadastro aberto, convites ou
  criação automática de usuários no callback.
- **Primeira entrega:** somente ambiente local, integrado ao Docker Compose
  existente. Implantação AWS, manifests Kubernetes e endurecimento de produção
  ficam para uma etapa posterior.

Essas confirmações fecham as três perguntas de escopo. O dono também
autorizou iniciar a implementação e revisar o `AGENTS.md` para remover os
bloqueios correspondentes. Isso não fixa os valores sugeridos de TTL ou nomes
de clientes, nem significa que a implementação já foi executada.

### 3.2 Condições técnicas antes da implementação

1. **Instruções do projeto — revisão no arquivo concluída:** o `AGENTS.md`
   agora permite especificamente OIDC via Keycloak para os dois usuários,
   Keycloak no Compose local e Client Credentials app → IA. Mantém a sessão
   existente, a remoção de Clerk e código empresarial e a proibição de outras
   ferramentas/dependências sem autorização. O ajuste das instruções não
   modifica o comportamento atual da aplicação.
2. **Configuração local:** definir issuer canônico, porta do Keycloak e
   resolução do mesmo emissor no navegador e nos contêineres, além das redirect
   URIs exatas. HTTP só pode ser uma concessão documentada do laboratório
   local, sem exposição externa; não é um modelo de produção.
3. **Contas e sessões:** definir o provisionamento do vínculo `(iss, sub)` das
   duas contas, duração da sessão local e comportamento de logout/revogação.
   A sessão de 8 horas da seção 4.1 continua uma sugestão, não uma confirmação.
4. **Bibliotecas Python:** o `uv.lock` da IA contém `PyJWT[crypto]` por meio de
   `mcp`, mas esses pacotes não são dependências diretas do projeto e o
   Dockerfile instala a partir de `pyproject.toml`, não do lock. Confirmar uma
   API suportada da dependência existente e sua disponibilidade na imagem.
   Se for necessário declarar PyJWT diretamente, pedir autorização antes de
   alterar dependências. Não implementar criptografia ou validação JWT manual.

A entrega local completa inclui OIDC e Client Credentials. É possível
implementar e testar Client Credentials primeiro, mas manter `select-user`
como entrada final não atende ao escopo OIDC confirmado.

## 4. Arquitetura proposta

```text
Navegador ── redirecionamento de login ──→ Provedor OIDC/Keycloak
    │                                        │
    │ cookie HttpOnly da sessão atual        │ código de autorização
    ▼                                        ▼
Frontend/Nginx ── /api/auth/oidc/* ──→ Backend NestJS (cliente OIDC/BFF)
                                           │
                   Client Credentials ─────┼──→ endpoint de token do provedor
                                           │
                   Bearer técnico ─────────┴──→ IA FastAPI (Resource Server)
                                                    │
                   JWT delegado do usuário          │
Backend /mcp ←───────────────────────────────────────┘
```

### 4.1 Usuário: OIDC mediado pelo backend

Recomenda-se o padrão **Backend for Frontend (BFF)**: o NestJS realiza o
protocolo OIDC e emite a sessão já existente. Isso adapta o exemplo do trabalho
para preservar os consumidores atuais, sem guardar tokens OAuth no
`localStorage` ou `sessionStorage` e sem aceitar uma autenticação paralela nas
APIs do app.

Fluxo planejado:

1. A interface oferece entrar pelo provedor. O backend inicia a transação em
   `/api/auth/oidc/login`, com `state`, `nonce` e PKCE S256 aleatórios.
2. Guardar a transação no Redis existente, com TTL curto, vínculo ao navegador
   por cookie HttpOnly e consumo único. Não guardar o `code_verifier` na URL;
   o Redis permite atender o callback em outra réplica.
3. Usar redirect URI exata e configurada: `/api/auth/oidc/callback`. Um destino
   pós-login só pode ser caminho local permitido, nunca uma URL arbitrária.
4. No callback, validar transação, `state`, `nonce`, emissor, assinatura,
   audiência do ID Token e validade, por meio de `openid-client`, já presente
   no servidor. Trocar o código no backend com o `code_verifier`.
5. Resolver **`(iss, sub)` → usuário local** por vínculo previamente
   provisionado, único e persistido em migração própria. Nunca vincular
   automaticamente por e-mail, nome, papel recebido ou ID enviado pelo cliente.
   Usuário não vinculado, removido ou desabilitado não recebe sessão.
6. Criar a sessão com `SessionService.createSessionAndToken`, preservando
   `authToken`, `user_sessions`, `@AuthUser()` e `@AuthWorkspace()`. As APIs do
   app continuam aceitando sua sessão local, não tokens genéricos do Keycloak.
7. Remover a entrada pública `/auth/select-user` e a tela de escolha na entrega
   OIDC. Não deixar fallback automático para ela se o provedor falhar.

O cadastro e a gestão de credenciais ficam no provedor, com registro público
bloqueado para este recorte. O app mantém os dois usuários e suas permissões
locais; não converte qualquer papel externo em `owner`.

**Sessão e logout:** o padrão atual de JWT é 90 dias e precisa ser revisto.
Como ponto de partida sujeito a aprovação, propor sessão absoluta de 8 horas,
sem renovação silenciosa nem `offline_access`; uma nova sessão passa novamente
pelo provedor. O vencimento do access token OIDC não é, por si só, o vencimento
da sessão BFF. Logout revoga a sessão local, limpa o cookie e pode iniciar o
logout do provedor com retorno exato e validado. Não prometer revogação local
imediata ao bloquear uma conta no provedor: isso exige back-channel logout ou
outro mecanismo explícito, a definir antes da implementação se for requisito.

Na entrada em operação, invalidar sessões anteriores e tratar tokens legados
sem `sessionId`, para que uma sessão obtida pela antiga escolha pública não
continue válida. Verificar separadamente expiração/revogação dos tokens de
colaboração e conexões já abertas, sem reescrever o protocolo colaborativo.

### 4.2 Backend → IA: Client Credentials

O backend é cliente confidencial e a IA é Resource Server. O segredo do
cliente é apresentado **ao provedor**, nunca enviado à IA ou ao navegador.
A IA valida assinatura assimétrica por JWKS e não precisa conhecer esse
segredo.

Clientes propostos no realm `as-docs` (nomes sujeitos a aprovação):

| Registro | Uso e concessões |
|---|---|
| `docs-app-web` | Cliente OIDC confidencial do BFF; Authorization Code + PKCE; sem service account. |
| `docs-app-indexer` | Service account; apenas Client Credentials; audiência `docs-ai`; escopos de indexação. |
| `docs-app-assistant` | Service account; apenas Client Credentials; audiência `docs-ai`; escopos de conversa e escrita assistida. |
| `docs-ai` | Identificador do recurso/audiência; sem fluxos de login ou emissão desnecessários. |

Separar indexador e assistente permite negar escrita no índice ao cliente de
conversa. Ambos continuam no backend atual; isso não cria isolamento de
processo contra comprometimento do próprio backend.

Fluxo planejado:

1. Um provedor de tokens reutilizável obtém access token com
   `grant_type=client_credentials`, usando `openid-client`. Preferir
   `client_secret_basic` se suportado pelo provedor; fixar o método no contrato.
2. Cache somente em memória por cliente e conjunto de escopos. Propor tokens
   de 300 s e renovação antecipada de 30 s, com requisição de renovação
   compartilhada entre chamadas concorrentes e timeout limitado.
3. Não usar refresh token: obter outro token técnico pelo mesmo grant.
4. Indexação, chat e escrita assistida passam pelo mesmo cliente HTTP
   autenticado, que seleciona a identidade e os escopos pela operação.
5. Enviar `Authorization: Bearer <access_token>` e preservar
   `idempotency-key` onde exigida. Remover os cabeçalhos `x-ai-consumer`,
   `x-ai-timestamp` e `x-ai-signature` do novo contrato.
6. Em `401` anterior ao streaming, invalidar o cache e permitir no máximo
   uma nova tentativa, com **o mesmo corpo e a mesma chave de idempotência**.
   Não renovar por `403` e não reiniciar um stream que já começou.

A autenticação ocorre antes de abrir o SSE. Um stream autorizado pode terminar
sob o timeout definido mesmo se o token vencer durante sua execução; uma nova
requisição precisa de token válido. A expiração não deve causar duplicação de
operações ou perda da capacidade de cancelar a geração.

### 4.3 Validação e autorização na IA

Validar, antes de executar a operação ou servir replay do cache:

- assinatura assimétrica, algoritmo permitido fixado (inicialmente RS256) e
  chave compatível; rejeitar `none`, algoritmos inesperados e confusão com HS256;
- `iss` exato, `aud` contendo `docs-ai`, `exp` obrigatório, `nbf` quando presente
  e demais claims exigidos pelo perfil acordado, com tolerância temporal limitada;
- identidade técnica permitida (`azp` no perfil Keycloak e service account
  correspondente), não apenas a existência de algum token do realm;
- escopo da rota e vínculo do cliente ao workspace permitido.

| Rota da IA | Escopo proposto | Cliente autorizado inicialmente |
|---|---|---|
| `POST /v1/index/pages` | `ai:index:write` | `docs-app-indexer` |
| `POST /v1/index/status` | `ai:index:read` | `docs-app-indexer` |
| `POST /v1/chat/stream` | `ai:chat:invoke` | `docs-app-assistant` |
| `POST /v1/generations/stream` | `ai:writing:invoke` | `docs-app-assistant` |
| `POST /v1/embeddings` | `ai:embeddings:create` | Nenhum por padrão; habilitar somente com consumidor identificado. |

As rotas de health permanecem sem Bearer e sem dados sensíveis. Scopes e
mappers precisam ser configurados no provedor e conferidos nos tokens reais;
apenas pedir um escopo no cliente não concede a permissão.

A allowlist confiável **cliente → tenantId permitido** será provisionada com o
workspace criado pelo seed e validada contra o payload. Não confiar no
`tenantId` recebido isoladamente nem dar acesso a outros workspaces por um
papel global. A identidade de idempotência virá de emissor/cliente verificados,
nunca de cabeçalhos livres, token bruto ou `jti` que muda a cada renovação.

Usar cache JWKS com atualização controlada em rotação/`kid` desconhecido,
limites de consulta e URLs de descoberta fixadas pela configuração. Não buscar
chaves de URLs fornecidas pelo token. Falha de verificação nega a operação;
indisponibilidade do provedor nunca permite aceitar token sem assinatura.

Ausência/token inválido retorna `401` com desafio Bearer apropriado; cliente
válido sem permissão retorna `403`; falha operacional de obtenção de chaves ou
tokens retorna erro de disponibilidade, sem abrir stream nem vazar detalhes.

### 4.4 MCP: preservar delegação do usuário

Client Credentials identifica uma aplicação, **não o usuário que perguntou**.
Logo, o JWT delegado atual permanece: audiência `tcc-docs-mcp`, escopo
`docs:read`, TTL curto e usuário/workspace definidos pelo backend.

A IA continua usando essa credencial somente no `/mcp`, com allowlist de
leitura e filtros `accessiblePageCondition`. O token técnico `docs-ai` não
pode acessar o MCP, e o token MCP não pode acessar as rotas `/v1/*`.

A substituição solicitada remove o HMAC de requisições app → IA, não todas as
assinaturas internas. `APP_SECRET` continua necessário para a sessão e a
credencial delegada. OAuth Token Exchange/delegação emitida pelo provedor seria
um projeto posterior, não uma substituição por Client Credentials puro.

## 5. Infraestrutura e operação

**Recorte desta entrega: Docker Compose local.** Manter o frontend na porta
8080 e acrescentar o Keycloak com persistência e configuração de realm sem
segredos versionados. A porta e o nome canônico do provedor serão definidos
antes da implementação. Publicar serviços de laboratório somente em loopback;
a IA, o banco e o Redis permanecem sem porta pública. Não executar publicação
na AWS nem alterar manifests Kubernetes nesta primeira entrega.

- Usar uma URL canônica de issuer alcançável pelo navegador, backend e IA,
  com DNS e certificados coerentes; não contornar a divergência entre host
  público e nome Docker desabilitando a checagem de `iss`.
- Para o Keycloak local confirmado, planejar configuração sem segredos, com
  armazenamento persistente e credenciais próprias; não dar ao app acesso ao
  banco do provedor. `start-dev` e HTTP ficam restritos ao laboratório.
  Senhas das duas contas e segredos técnicos não entram no JSON do realm
  versionado nem são reutilizados de outros projetos.
- A IA segue privada e `/mcp` continua bloqueado no Nginx da borda.
- **Etapa futura, fora da primeira entrega:** na AWS, definir implantação do
  provedor e transporte antes de criar manifests; não publicar console
  administrativo irrestritamente.
- Como requisito para produção futura, exigir TLS nos trechos que transportam
  tokens/códigos/segredos, inclusive internos. O HMAC anterior vinculava método, caminho e corpo;
  Bearer não fornece essa assinatura nem impede replay por quem rouba o token.
  Rede privada, expiração curta e idempotência não substituem TLS.
- Segredos OIDC e dos clientes técnicos ficam no `.env` protegido/Kubernetes
  Secret, fora do Git, imagens, `window.CONFIG`, logs e mensagens SSE.
- Validar cookies `HttpOnly`, `Secure` em HTTPS e `SameSite` compatível com o
  callback; proteger operações autenticadas por cookie contra CSRF, com
  validação de origem e política documentada. PKCE não substitui essa proteção.
- Revisar proxy/headers de origem confiáveis e impedir que códigos, tokens,
  `state`, `nonce` e `code_verifier` apareçam nos logs de callback ou de HTTP.
- Novos nomes de configuração serão definidos no contrato: issuer, cliente
  OIDC, callback, clientes técnicos, audiência, escopos e allowlist de tenants.
  Remover `DOCS_AI_HMAC_SECRET`, `AI_CONSUMERS_JSON` e configurações de skew
  HMAC apenas após a migração completa. **Não remover `APP_SECRET`.**
- Boot/liveness não devem depender da disponibilidade do provedor. Novos
  logins e chamadas sem credencial válida falham fechados; sessões locais e
  tokens já verificáveis funcionam apenas dentro da validade. Readiness da IA
  deve refletir configuração OAuth, chaves utilizáveis e dependências locais,
  sem derrubar o app inteiro quando a IA ou o provedor estiverem indisponíveis.
  Definir a política de cache em indisponibilidade e verificar os healthchecks
  locais. A revisão das probes Kubernetes, que hoje apontam para liveness
  também na readiness, fica registrada para a entrega AWS posterior.
- Logs estruturados podem registrar operação, resultado e correlação, sem
  credenciais. Não reintroduzir auditoria genérica na tabela `audit`.

## 6. Etapas e arquivos impactados

| Etapa | Entregas previstas | Critério para avançar |
|---|---|---|
| 0. Fechamento técnico | Escopo local, Keycloak e dois usuários já confirmados; resolver a seção 3.2, registrar decisões nos dois repositórios e ajustar instruções conflitantes antes de implementar. | Regras, configuração local, sessões e bibliotecas compatíveis com a implementação. |
| 1. Fundação | Configuração do provedor, clientes, audiences, scopes, discovery/JWKS e exemplos sem segredos. Verificar bibliotecas existentes nas imagens. | Tokens reais de teste têm os claims mínimos; fluxos não usados estão desligados. |
| 2. IA como Resource Server | Nova autenticação e autorização em `auth.py`, `app.py`, `config.py`; manter idempotência e contratos funcionais. | Todas as rotas protegidas; testes de assinatura, audiência, cliente, escopo e tenant passam. |
| 3. Backend como cliente técnico | Provedor de tokens/cliente HTTP comum; migrar indexação, chat e escrita assistida; trocar validação de ambiente. | As três funcionalidades usam Bearer e não dependem de HMAC. |
| 4. Entrada OIDC | Novos endpoints no auth, vínculo `(iss, sub)` em migração, transações Redis e emissão da sessão existente; substituir a escolha no cliente. | Só as duas contas vinculadas entram; entrada antiga bloqueada; colaboração preservada. |
| 5. Entrega local e corte | Docker Compose, `.env.example`, configuração local do Keycloak, scripts, documentação e revogação das sessões antigas; sem implantação AWS. | Stack local reproduzível, sem fallback inseguro e sem segredos antigos compartilhados entre app/IA. |
| 6. Verificação | Unitários, integração, navegador e E2E nos dois projetos; evidências e limitações documentadas. | Critérios da seção 7 atendidos. |

**Mapa do app:**

- `apps/server/src/core/auth/`, `core/session/` e `core/tcc/`;
- `apps/server/src/database/migrations/`, repositório de vínculos e tipos de
  banco (conferir manualmente o diff de `db.d.ts`);
- `apps/server/src/integrations/tcc-ai/`: substituir `ai-signing.ts` e seus
  testes por integração OAuth, preservando o protocolo MCP;
- `apps/server/src/integrations/assisted-writing/`: remover assinatura
  duplicada e compartilhar obtenção de token/retry;
- `apps/server/src/integrations/environment/` e módulos NestJS envolvidos;
- `apps/client/src/features/auth/`, página de entrada e locales;
- `docker-compose.yml`, `.env.example`, `frontend/nginx/`, configuração local
  do Keycloak, `scripts/tcc-common.sh`, E2E e scripts de navegador/seed que
  escolhem usuário. Os manifests de `deploy/k8s/` ficam fora desta entrega.

**Mapa da IA (`../As-docs-ai`, contraparte atual):**

- `src/tcc_docs_ai/auth.py`, `app.py`, `config.py`, `errors.py` e testes;
- integração da identidade autenticada com `chat.py`, `service.py` e
  idempotência, sem alterar a lógica de índice ou geração;
- `.env.example`, execução local/Compose próprio, healthchecks e documentação;
  manifests Kubernetes ficam para a entrega AWS posterior;
- `docs/tcc/06-contratos.md`: contrato de autenticação autoritativo, atualizado
  na mesma entrega que o app; manter camelCase e eventos SSE funcionais.

A primeira migração pode usar um corte coordenado app/IA, com pausa breve das
operações de IA, sem aceitação dupla nem fallback HMAC em runtime. Preparar
rollback explícito do par de versões/configurações, preservando dados. Após a
entrada OIDC, um rollback não pode reabrir a escolha pública de usuários em
ambiente protegido; é preferível indisponibilidade controlada.

## 7. Plano de testes e aceite

### Autenticação de usuários

- Login real das duas contas; terceiro usuário ou vínculo desconhecido negado.
- `state`/`nonce` incorretos, transação expirada/reutilizada, código reutilizado,
  PKCE inválido, emissor/audiência errados e redirect arbitrário rejeitados.
- Callback atendido em réplica diferente; falha do provedor sem sessão criada.
- `/auth/select-user` não emite sessão na entrega OIDC; sessões anteriores
  invalidadas; cookie correto; expiração, logout e proteção CSRF verificados.
- REST, Socket.IO e edição colaborativa com dois contextos de navegador;
  isolamento entre conversas/usuários e permissões continuam funcionando.
- Interface e erros conhecidos traduzidos via `react-i18next`, com chaves
  `en-US`/`pt-BR`, parâmetros iguais e fallback seguro; conferir os dois idiomas
  e o fallback dos outros dez locales, sem traduções improvisadas.

### Comunicação entre serviços

- Token ausente, expirado, futuro, adulterado, algoritmo inesperado, issuer ou
  audience errados, cliente não permitido e token de usuário negados.
- Cada rota exige seu escopo; o assistente não escreve no índice; token de
  outro tenant é negado. Headers HMAC isolados não autenticam mais.
- Cache e renovação antecipada; chamadas concorrentes; rotação de segredo e
  JWKS; `kid` desconhecido; queda do provedor; ausência de tempestade de retries.
- Uma tentativa adicional em `401`, nenhuma em `403`, chave/corpo estáveis,
  replay após renovação e ausência de repetição após início do SSE.
- Credenciais de sessão, técnicas e MCP não são intercambiáveis; MCP continua
  somente leitura e filtrado pelo usuário; credenciais não aparecem em saídas.
- `/health/live`, `/health/ready`, healthchecks locais e inicialização sem
  acesso ao provedor apresentam o comportamento documentado; readiness do
  cluster será verificada na futura entrega AWS.

### Regressão funcional e evidências

Rodar TypeScript/Jest no servidor, TypeScript/Vitest no cliente e Ruff/Pytest
na IA, conforme os guias de cada projeto. Comparar as falhas preexistentes com
um baseline; não classificá-las como regressão sem comparação.

Adaptar os testes que usam `select-user`: usar o `playwright-core` já existente
para autenticar duas contas pelo Authorization Code e integrar as sessões ao
roteiro E2E. Não habilitar Password Grant, endpoint de bypass ou credenciais
reais em código para facilitar os testes.

Executar E2E com a stack reconstruída e a URL atual do frontend
(`http://localhost:8080` no Compose deste checkout), cobrindo:

1. Entrada dos dois usuários e estrutura fixa do seed.
2. Indexação, resposta pelo índice e atualização de página por outro usuário.
3. Leitura MCP da versão mais nova quando o índice está defasado.
4. Ausência de resposta sem evidência e preservação dos eventos SSE.
5. Indexação incremental sem reindexar versões antigas.
6. Escrita assistida, aplicação e desfazer, sem duplicação em retry.
7. Negativas de autenticação/autorização nos endpoints reais.

Usar provedores determinísticos sem chave onde suportado; a escrita assistida
real mantém a exigência da chave própria da OpenAI. Não alterar modelo,
temperatura, embeddings, trigger de versão ou invariantes do índice por causa
da migração de identidade.

**Documentação final:** atualizar decisões, visão geral, cortes de
funcionalidade, integração IA/MCP, testes e deploy dos dois projetos; remover
instruções HMAC obsoletas. Registrar o que foi efetivamente executado e as
limitações restantes, sem apresentar o planejamento como implementação ou
validação de segurança concluída.
