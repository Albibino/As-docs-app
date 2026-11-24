# As-docs AWS Academy — HTTPS interno e OAuth2

## Estado validado em 24/11/2026

- Frontend público: https://www.asdocs.abrdns.com
- EKS: as-docs-eks, us-east-1, namespace as-docs
- Backend: 1 réplica, armazenamento persistente
- IA: 2 réplicas, com Uvicorn e sidecar Caddy
- HTTPS interno: as-docs-ai.as-docs.svc.cluster.local:8443
- Keycloak: realm as-docs
- OAuth2 habilitado entre backend e IA
- Chat, recuperação de fontes e indexação de nova página testados
- SonarQube e CI/CD: etapas posteriores

## Dependências

São necessários: credenciais AWS Academy válidas, cluster EKS,
workers Ready, imagens disponíveis no ECR, Keycloak, Redis, banco,
DNS/ALB e os Secrets Kubernetes configurados.

Não armazenar senhas, tokens ou chaves privadas neste repositório.

## Secrets necessários

Namespace: as-docs

- as-docs-ai-secret
- as-docs-backend-secret
- as-docs-ai-tls (tls.crt e tls.key)

O Secret TLS deve existir ANTES de aplicar o Deployment da IA.

Os client secrets do Keycloak permanecem no Secret do backend:
OIDC_CLIENT_SECRET_INDEXER e OIDC_CLIENT_SECRET_ASSISTANT.

## Certificados

A CA interna foi gerada em 24/11/2026.
O certificado do servidor tem validade de 90 dias.

Certificado DNS:
as-docs-ai.as-docs.svc.cluster.local

Os arquivos ca.key, server.key, server.crt e ca.crt foram mantidos
fora do Git, em %LOCALAPPDATA%\as-docs\internal-tls no Windows
que executou a implantação.

Os arquivos privados precisam de backup protegido, separado do Git.
O ConfigMap as-docs-internal-ca contém somente o certificado público.

Para recuperar o ambiente, restaurar o Secret TLS com certificado
compatível com a CA versionada. Se a CA mudar, atualizar também
o ConfigMap da CA e reiniciar backend e IA para carregar as mudanças.

## Ordem de implantação

1. Renovar as credenciais AWS Academy e verificar o EKS.
2. Confirmar workers Ready e dependências.
3. Confirmar as imagens no ECR.
4. Criar ou restaurar Secrets sem versionar seus valores.
5. Aplicar ConfigMaps da IA, incluindo as-docs-ai-caddy.
6. Aplicar ConfigMaps do backend, incluindo as-docs-internal-ca.
7. Aplicar os demais recursos necessários e os Deployments.
8. Verificar rollout, HTTPS, OAuth2, indexação e chat.

Os manifests ficam em:
- As-docs-ai/deploy/k8s
- As-docs-app/deploy/k8s

Não aplicar arquivos *.example.yaml como Secrets reais.

## Verificação

kubectl get nodes
kubectl -n as-docs get deployments,pods,services
kubectl -n as-docs rollout status deployment/as-docs-ai
kubectl -n as-docs rollout status deployment/as-docs-backend

Teste funcional obrigatório: login no site, edição de documento,
indexação de nova página, chat e recuperação da fonte.

## OAuth2

Clientes Keycloak:
- docs-app-indexer: ai:index:write, ai:index:read
- docs-app-assistant: ai:chat:invoke, ai:writing:invoke

Audience: docs-ai

A IA valida a assinatura JWT pelo JWKS do Keycloak.
O acesso à IA é restrito ao backend por NetworkPolicy.

## Recuperação

Em caso de falha de OAuth2, é possível retornar temporariamente
para HTTPS + HMAC configurando AI_OAUTH_ENABLED=false e
DOCS_AI_OAUTH_ENABLED=false nos ConfigMaps, seguido de restart
dos dois Deployments. Manter os Secrets HMAC enquanto o rollback
for necessário.

Em novas sessões AWS Academy, verificar também se o node group
EKS e o Auto Scaling Group recuperaram suas instâncias.

## Pendências posteriores

- SonarQube
- CI/CD
- Complementar documentação das quatro implantações independentes
- Automatizar renovação e distribuição protegida dos certificados

## Adaptacao para outras implantacoes

Os manifests sincronizados representam a implantação validada
em 24/11/2026, não um ambiente automaticamente portátil.

Para cada implantação independente, verificar:

- Conta AWS e referências de imagens ECR.
- Região, cluster, namespace, DNS e certificados.
- Clientes Keycloak, seus secrets e permissões.
- Issuer OIDC, audience e endpoint JWKS.
- Os subjects dos clientes em AI_OAUTH_CLIENTS_JSON,
  que devem corresponder aos clientes criados no novo realm.
- Configurações de banco, Redis, armazenamento e DNS público.

Não reutilizar a chave privada da CA entre ambientes
independentes. Gerar certificados específicos e distribuir
a CA correspondente ao backend.

Após atualizar a configuração, executar os testes
de autorização, indexação e chat em cada ambiente.
