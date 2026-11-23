# Infraestrutura aplicada — entrega para o deploy

Conta 967931808920, us-east-1. Borda aplicada com 20 adicoes, 0 alteracoes,
0 exclusoes; tres testes simulados passaram e o plano posterior foi No changes.
Verificacao real confirmou EC2/SSM, discos criptografados, LBs, WAF 403 e MCP 404.

## Dados para configurar os servicos

| Campo | Valor |
|---|---|
| FRONTEND EC2 AZ A | i-0ad030a1fc6675d94, privado 10.0.0.248 |
| FRONTEND EC2 AZ B | i-077658c6a158294e8, privado 10.0.1.240 |
| Acesso aos hosts | SSM Session Manager; sem SSH |
| PUBLIC_APP_URL / APP_URL temporarios | http://as-docs-public-1122695300.us-east-1.elb.amazonaws.com |
| BACKEND_URL nas EC2 | http://as-docs-internal-7c51427a5e2ed1f2.elb.us-east-1.amazonaws.com:3000 |
| Service do backend no cluster | as-docs-backend.as-docs.svc.cluster.local:3000 |
| NodePort fixo | 30300 |
| StorageClass | gp3, encrypted, WaitForFirstConsumer, Retain |
| Cluster / grupo | as-docs-eks / as-docs-private-storage |
| WAF logs | aws-waf-logs-as-docs |

O NLB e o registro dos nos pelo ASG ja estao no Terraform. Substituir SOMENTE o
bloco Service de deploy/k8s/22-backend.yaml pelo backend-service.yaml desta pasta:
type NodePort, externalTrafficPolicy Cluster, nodePort 30300. Remover annotations
de LBC/loadBalancerSourceRanges do bloco antigo; preservar PVC/Deployment/policies.
Nao aplicar depois o Service LoadBalancer antigo. Nao precisa instalar controller.

O bootstrap prepara Docker/SSM, nao publica containers. Nas duas EC2, conferir
cloud-init/Docker, configurar credenciais de registro em privado se necessario,
publicar a imagem real e mapear 80:8080. Usar backend_url na variavel BACKEND_URL.
Ver README.md para Compose, plugin e fluxo de deploy. Nenhum token foi embutido.

Antes de publicar a nova imagem frontend, aplicar o pequeno frontend-protocolo.patch
no repo atualizado. Corrige somente a autorreferencia no map X-Forwarded-Proto;
preserva o callback OIDC e seus logs desabilitados implementados pelo Pedro.
Executar git apply --check antes. Nao copiar um Nginx completo de uma versao antiga.

O RDS e suas instrucoes estao em ../database/ENTREGA_AO_MUCI.md. A senha fica no
arquivo local ignorado do executor e deve ser entregue ao responsavel por um
canal privado autorizado. Nao publicar em commit, PR, output, evidencias ou grupo.
O provisionamento cria somente o banco asdocs; usuarios/bancos do Keycloak e
migracoes SQL continuam como tarefas do deploy.

## O que ainda precisa funcionar

Na verificacao, os targets frontend estavam unhealthy e os backend initial.
Sem os servicos reais, 503 na origem publica e esperado; nao e aplicacao pronta.
Depois de publicar Service/containers, executar na pasta infra/edge do CloudShell:

```bash
source ./cloudshell-env.sh
python3 ./verificar-borda.py --aplicacao
```

Isso exige targets healthy e rotas reais /healthz e /api/health/live com 200.
O grupo testa ainda login/Keycloak, IA, SSE, WebSocket, colaboracao e uploads.
Conexao SQL, persistencia dos dados reais e restauracao de backups tambem precisam
de evidencia. Multi-AZ e o teste do volume temporario nao substituem teste de DR.

HTTPS permanece PENDENTE. Confirmar dominio controlado pelo grupo e certificado
ACM ISSUED cobrindo esse nome, nesta conta/us-east-1. Configurar DNS e os valores
de tls.tfvars.example; revisar/aplicar o plano que habilita 443/redirect. Atualizar
origens PUBLIC_APP_URL/APP_URL e redirects do Keycloak. Nao apresentar HTTP
temporario ou o DNS AWS como HTTPS final.

State edge separado: as-docs/edge.tfstate no bucket de state existente.
GitHub nao concede acesso AWS. Executar somente com sessao autorizada da conta.
