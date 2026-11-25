# TCC — documentação do tcc-docs-app

Registro das funcionalidades, decisões e testes do app do TCC. O
serviço de IA é o repositório irmão `tcc-docs-ai`, que tem a sua própria pasta
`docs/tcc/`.

| Arquivo | Conteúdo |
|---|---|
| [01-visao-geral.md](01-visao-geral.md) | O que o app faz no TCC e como se encaixa com a IA. |
| [02-cortes-de-funcionalidade.md](02-cortes-de-funcionalidade.md) | O que foi removido (login, convites, publicação…) e o que ficou. |
| [03-decisoes.md](03-decisoes.md) | Decisões de arquitetura e o motivo de cada uma. |
| [04-ia-indexacao-mcp-chat.md](04-ia-indexacao-mcp-chat.md) | Versão das páginas, indexador, servidor MCP e chat. |
| [05-testes.md](05-testes.md) | Como rodar os testes e o E2E. |
| [06-docker-e-railway.md](06-docker-e-railway.md) | Stack local e publicação no Railway. |
| [08-roteiro-de-teste-manual.md](08-roteiro-de-teste-manual.md) | Passo a passo para testar pela interface, com respostas esperadas. |
| [09-plano-oauth2-oidc.md](09-plano-oauth2-oidc.md) | Escopo e critérios de aceite de OIDC e OAuth 2.0 Client Credentials. |
| [10-keycloak-local.md](10-keycloak-local.md) | Subir Keycloak no Compose local, provisionar as duas contas e ativar o login OIDC. |
| [11-autoscaling-academy.md](11-autoscaling-academy.md) | Verificar permissões, métricas e grupos de escala no AWS Academy. |
| [Laboratório individual na AWS](../../infra/lab/README.md) | Inicializar e provisionar rede, EKS, RDS e borda na própria conta, sem S3 compartilhado. |
| [Deploy da aplicação na AWS](../../deploy/README.md) | Publicar imagens por digest, configurar OIDC e validar frontend e backend. |
| [12-entrega-aws-ci-cd.md](12-entrega-aws-ci-cd.md) | Reaproveitamento do deploy do grupo e decisões pendentes para CI/CD no laboratório. |
| [13-ia-oauth-aws.md](13-ia-oauth-aws.md) | Deploy da IA privada com Client Credentials a partir do state do laboratório. |
