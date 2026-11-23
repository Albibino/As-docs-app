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

## D14. Infraestrutura da adaptação AWS Academy por etapas

**Decisão:** acrescentar `infra/terraform` começando pela rede em duas zonas de
disponibilidade, usando a conta e as funções IAM existentes informadas pelo
usuário. O provider restringe a conta de destino; nenhuma função IAM é criada.

**Por quê:** o laboratório restringe IAM e disponibiliza funções próprias do EKS.
A rede como primeira etapa permite conferir o plano antes de dimensionar EKS,
banco, NAT e balanceadores. O CIDR padrão mantém compatibilidade com os manifests.

**Consequência:** essa etapa não representa a aplicação inteira implantada nem um
plano completo de DR. O grupo precisa definir o papel dos dois RDS e do DynamoDB,
conferir as permissões das funções EKS, definir o backend compartilhado do state
e implementar backups e recuperação de dados. Ver `09-terraform-aws-academy.md`.

**Ajuste após teste no laboratório:** o provider não coube no diretório pessoal
do CloudShell. Seus dados regeneráveis passam a usar `TF_DATA_DIR` em `/var/tmp`,
e o download usa `TMPDIR=/var/tmp`. Código e state local continuam no diretório
pessoal para preservar a infraestrutura entre sessões.

## D15. Backend S3 para continuidade da infraestrutura

**Decisão:** após aplicar a rede, preparar um bucket privado, versionado e
criptografado, com bloqueio nativo do state por S3. O usuário confirmou que a
implantação final continuará na mesma conta do Learner Lab.

**Por quê:** o state correspondente aos recursos existentes precisa acompanhar
a continuidade do projeto e ficar separado das dependências temporárias do
CloudShell. O bootstrap do bucket usa uma configuração Terraform independente.

**Consequência:** migrar com `init -migrate-state`, mantendo backup e verificando
os 22 recursos e um plano sem diferenças. O pacote não concede acesso IAM aos
colegas nem substitui o plano de recuperação dos dados da aplicação. Ver
`10-state-s3.md`.

## D16. Recuperação do bootstrap S3 e confirmação dos nós EKS

**Decisão:** suspender o bootstrap Terraform do bucket nesta conta após a negativa
SCP de `s3:GetBucketObjectLockConfiguration`. Configurar o bucket existente por
operações S3 específicas de bloqueio público, criptografia e versionamento, com
verificação de propriedade e preservação dos registros locais.

**Por quê:** a consulta Object Lock feita pelo recurso genérico não é necessária
ao bloqueio de state `use_lockfile`. O laboratório nega essa consulta. Não serão
alteradas políticas IAM/SCP; outras negativas também interrompem a execução.

**Consequência:** o bucket de apoio fica sob o procedimento CLI documentado. O
state da rede continua local até confirmar a migração e um plano sem diferenças.
William solicitou o código no repositório da aplicação e confirmou três nós
privados EKS. O código de infraestrutura ficará em `infra/terraform`; os helpers
do state em `infra/state-backend`. States e credenciais ficam fora do Git.

## D17. Backend S3 ativo após migração verificada

**Decisão:** incluir `infra/terraform/backend.tf` no código compartilhado depois
de confirmar a migração real para o bucket S3 da conta do Academy.

**Por quê:** os próximos executores precisam reconhecer os mesmos recursos já
criados, usando o state correspondente. Compartilhar a configuração de backend
permite inicializar esse mesmo destino com uma sessão AWS autorizada.

**Consequência:** o usuário confirmou a cópia local para S3, inicializou novamente,
listou os 22 recursos gerenciados e obteve `No changes`. O arquivo de configuração
do backend pode entrar no Git; o state e as credenciais continuam fora dele.
O helper de migração inicial não deve ser repetido.

## D18. EKS gerenciado com três nós privados no Academy

**Decisão:** preparar EKS 1.37, três nós gerenciados `t3.medium` privados, NAT por
zona, logs e add-ons de rede/DNS no mesmo state S3. Reutilizar as duas funções
confirmadas; limitar a API pública a IPv4 `/32` e habilitar a API privada.

**Por quê:** William confirmou três nós EKS, e a conta informou 1.37 em suporte
padrão. As políticas da node role atendem rede, registro dos nós e imagens ECR.
O NAT por zona evita que a saída de toda a rede dependa de um único NAT zonal.

**Consequência:** a etapa acrescenta 13 recursos Terraform e preserva os 22 da
rede. O plano real e o apply foram concluídos no CloudShell com 13 adições,
nenhuma alteração e nenhuma exclusão; validate e testes simulados passaram.
A conferência posterior confirmou três nós Ready sem IP público, pods do sistema
Running e plano No changes. Não cria IAM. CSI e
integração de balanceador continuam pendentes: as políticas extras de Auto Mode
na cluster role não significam que esses controladores já estejam autorizados
nos nós comuns. Ver `11-eks-academy.md` e `infra/terraform/ETAPA_03_EKS.md`.

## D19. Banco PostgreSQL 18 em configuração independente

**Decisão:** preparar `infra/database` no mesmo bucket S3, com a chave própria
`as-docs/database.tfstate`, lendo os outputs da rede/EKS. Criar RDS privado,
Multi-AZ, com TLS e backups. Consultar versões/classes disponíveis na API antes
de gerar as variáveis locais. Usar senha efêmera e argumento de somente escrita.

**Por quê:** a base EKS já foi aplicada e verificada. Separar o banco permite
continuar seu provisionamento enquanto a integração CSI/IAM é resolvida, sem
modificar o state ou os testes da base. As classes e o gp2 seguem o Learner Lab.

**Consequência:** cinco recursos novos no state do banco; a aplicacao real no
CloudShell criou os cinco e o plano seguinte retornou No changes. Nenhum banco
foi criado durante a preparacao local. O deploy recebe outputs sem senha; a
credencial exige entrega privada. A rede precisa continuar disponível enquanto
o banco a utiliza. Multi-AZ consome créditos de primário e standby; backups e
um exercício de recuperação são tratados separadamente. Ver `12-banco-academy.md`.

## D20. Preparacao de EBS com a LabRole predefinida

**Decisao:** preparar a substituicao do node group por tres nos que usam a
LabRole ja existente, seguida do CSI EBS compativel retornado pela API. Nenhuma
politica ou confianca IAM e criada/editada. O novo nome e create_before_destroy
permitem manter os nos antigos ate a criacao dos substitutos.

**Motivo:** a sessao retornou implicitDeny para anexar politica a node role
original. A LabRole tem EC2, WorkerNode e ECR, e as operacoes EBS/CNI consultadas
retornaram allowed na simulacao. O cluster consultado tem apenas CoreDNS e
nenhum PVC. Isso ainda nao prova as permissoes efetivas de cada chamada real.

**Limitacao:** o schema gerenciado permite hostNetwork no node, mas nao no
controller; este precisa acessar IMDS com hop limit 2. O namespace as-docs
recebe egress excluindo IMDS antes da troca. A protecao por NetworkPolicy e
aditiva e nao equivale a IAM dedicado por workload. A excecao e especifica ao
Academy; fora dele, usar IRSA/Pod Identity e hop limit 1. Ainda depende de plano,
apply, testes de volume e do bloqueio. Ver `13-volumes-academy.md`.

**Resultado em 23/11/2026:** a queda do CloudShell durante o apply foi recuperada
com backup do state, liberacao do bloqueio proprio e import do CSI ja existente.
O apply de retomada concluiu 0 adicoes, 2 alteracoes e 1 exclusao do grupo antigo.
O teste real confirmou tres nos Ready sem IP publico, CSI operacional, escrita,
leitura apos recriar workload e bloqueio IMDS em regime estavel. Os objetos
temporarios foram removidos e o plano final retornou No changes. A limitacao
da janela inicial do VPC CNI standard permanece documentada; o teste nao
equivale a isolamento IAM por workload. A etapa 05 foi encerrada.

