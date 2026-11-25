# Etapa 06 — frontend, ALB, NLB e WAF

Aplicado no CloudShell em 23/11/2026: 20 recursos adicionados, nenhuma alteracao
ou exclusao. Os tres testes simulados passaram; o plano real foi revisado antes
do apply. Ver evidencias/2026-11-23-aplicacao-borda.md. A verificacao pos-apply
passou e o plano seguinte retornou No changes. Usa provider AWS 6.73.0 fixado e
Terraform 1.17.2. Formato HCL e sintaxes Bash/Python/YAML tambem foram conferidos.

## Uso direto ou pela raiz portátil

- **Legado (`infra/edge`):** sem `network_outputs`, usa o backend S3
  `as-docs/edge.tfstate` e lê os outputs de `as-docs/terraform.tfstate` na
  conta original. O perfil padrão continua `LabInstanceProfile` com `LabRole`.
- **Portátil (`infra/lab`):** a raiz passa `network_outputs` da própria rede
  e do EKS, `expected_account_id` e `frontend_instance_profile_name`. A borda
  não lê o state S3 legado; seus recursos ficam no state da raiz portátil.
  As chaves das duas sub-redes públicas precisam ser conhecidas no plano.
  Use um perfil existente com role da mesma conta e permissão para SSM.
  O ACM, se informado, deve ser dessa conta e de `us-east-1`.

Os comandos CloudShell e os helpers `preparar-borda.py` e `verificar-borda.py`
abaixo são específicos da implantação legada.

## O que o plano acrescenta

Em HTTP temporario, sao esperadas 20 adicoes, nenhuma alteracao ou exclusao de
recursos ja gerenciados. O state proprio e as-docs/edge.tfstate. O state da base
e consultado apenas como fonte de outputs; o banco permanece em state separado.

- Duas EC2 t3.micro em zonas diferentes, sub-redes publicas existentes, root
  gp3 criptografado de 10 GiB, IMDSv2 hop limit 1, perfil LabInstanceProfile e SSM.
- Docker e agente SSM no bootstrap. Sem SSH, senha, token ou containers ficticios.
  Muci publica o frontend real. A AMI vem do parametro publico AL2023 x86_64.
  Uma atualizacao desse parametro pode propor troca de AMI em plano futuro:
  revisar a substituicao, sem aplica-la automaticamente.
- ALB publico, target group das duas EC2 na porta 80, health check /healthz,
  bloqueio publico /mcp*, HTTP temporario ou HTTPS + redirecionamento com certificado.
- NLB privado em duas zonas, porta 3000; somente SG frontend como origem.
  Encaminha para NodePort 30300, com cross-zone e health /api/health/live.
- Uma regra adicional no SG EKS, aceitando 30300 somente do SG NLB. O target group
  e anexado ao ASG existente: novos nos sao registrados sem editar a escala EKS.
- WAF regional associado ao ALB: CommonRuleSet, reputacao IP, limite aproximado
  de 2000 requisicoes por IP em cinco minutos. Metricas e logs de bloqueio por 7 dias.

O grupo confirmou NLB no Terraform e entrega do Service NodePort ao Muci.
Nao e preciso instalar AWS Load Balancer Controller para este contrato.
O SG frontend ja limita entrada HTTP ao ALB e permite saida HTTPS e 3000 na VPC.
Nenhuma funcao/politica IAM, chave KMS ou regra do banco e criada por esta etapa.

O recurso aws_autoscaling_attachment configura a associacao do ASG ao target
group; ele nao assume a gestao do ASG ou do node group. Se o node group for
substituido em etapa futura, aplicar a base primeiro e revisar o plano desta
etapa para reanexar o ASG novo. Nao configurar o mesmo attachment por outro state.

## Execucao no CloudShell

Upload do ZIP pelo menu Acoes. A raiz e uma pasta NOVA:

```bash
cd "$HOME"
unzip -o As_docs_Terraform_Etapa_06_Borda.zip
cd as-docs-terraform-etapa-06-borda
source ./cloudshell-env.sh
python3 ./preparar-borda.py
terraform init
terraform fmt -check -recursive
terraform validate
terraform test
terraform plan -out=borda.tfplan
```

O preflight apenas consulta conta, perfil, cluster, nos, NodePort e regras WAF.
Se informar negativa de permissao ou conflito, preservar a saida e revisar.
O helper nao libera permissoes nem altera IAM. Os testes usam planos com mock AWS
e override do remote_state; NAO criam recursos reais nem consultam o bucket S3.

Conferir que o plano e desta pasta e usa edge.tfstate. A base e o banco nao
devem ser recriados. Depois de revisar o plano real:

```bash
terraform apply borda.tfplan
terraform output
python3 ./verificar-borda.py
terraform plan
```

A verificacao confirma EC2/SSM, criptografia, VPC/scheme dos LBs, associacao
WAF, bloqueio MCP e regra WAF sem User-Agent. Pode exigir alguns minutos de
bootstrap/propagacao. Exibe a saude real dos targets; a ausencia da aplicacao
nao e disfarcada por um servidor de teste. Targets unhealthy/empty e HTTP 503
sao esperados ate concluir os deploys reais, mas nao representam aplicacao pronta.
Nao afirmar que o NLB encaminha corretamente antes do teste final da aplicacao.

Os binarios regeneraveis usam /var/tmp para nao lotar o HOME do CloudShell.
O codigo e state S3 permanecem persistentes. Nao reenviar senha do banco,
.terraform, arquivos de state ou planos no Git.

## HTTPS e DNS — pendencia do grupo

Nao foi confirmado dominio/certificado. Por isso, defaults vazios produzem
somente HTTP temporario. Nao e a entrega final de HTTPS, login ou cookies seguros.
Para habilitar TLS, preencher tls.auto.tfvars conforme tls.tfvars.example:
dominio real controlado pelo grupo e ARN ACM desta conta/us-east-1, status ISSUED,
cobrindo o hostname. Confirmar tambem a validade temporal e cadeia do certificado.

O grupo configura DNS do hostname para public_alb.dns (ALIAS no Route 53 usando
zone_id, ou CNAME se for subdominio em outro provedor). Esta etapa nao compra,
registra ou presume propriedade de dominio. Depois, revisar/aplicar novo plano:
adiciona listener 443 e sua regra MCP, e troca a acao do listener 80 para redirect.
Usa politica TLS 1.2/1.3. Atualizar PUBLIC_APP_URL/APP_URL e os redirects do Keycloak.
O DNS AWS do ALB nao equivale a dominio proprio com certificado publico valido.

## Entrega ao Muci

Esta seção registra a entrega original. Para publicar agora, siga
[Deploy na AWS](../../deploy/README.md). O manifesto já adota o NodePort e o
template do Nginx já contém a correção; não reaplique o patch histórico.

1. Usar os outputs frontend_instances, backend_url, public_app_url e integration.
   BACKEND_URL nas EC2 recebe backend_url. PUBLIC_APP_URL nas EC2 e APP_URL no
   backend recebem public_app_url, ajustados novamente quando HTTPS estiver pronto.
2. Substituir SOMENTE o bloco Service de deploy/k8s/22-backend.yaml pelo conteudo
   de backend-service.yaml. Preservar PVC/Deployment/NetworkPolicy e seus ajustes.
   O Service continua as-docs-backend.as-docs.svc.cluster.local:3000 para a IA;
   o tipo passa de LoadBalancer para NodePort, com porta fixa 30300 e trafego Cluster.
   Remover annotations de LBC e loadBalancerSourceRanges do bloco antigo.
3. Aplicar os manifests do backend/Redis/IA/Keycloak e respectivos Secrets pelo
   procedimento do responsavel. O Terraform nao inclui nem publica essas senhas.
   A integracao de persistencia permanece gp3, validada na retomada; nao usar gp3-project.
4. Nas duas EC2, acessar por SSM, conferir cloud-init e Docker, e publicar a imagem
   real do frontend na porta 80 com o compose do repositorio. Instalacao/pinagem do
   plugin Compose e login no registro privado, quando necessario, ficam no deploy.
   Construir imagens no CI, nao nas EC2 micro. O deploy real precisa de imagem
   publicada/autorizada; este pacote nao presume que a tag latest esteja disponivel.
5. Incluir o ajuste frontend-protocolo.patch na imagem nova: corrige somente a
   autorreferencia default $fwd_proto para default $http_x_forwarded_proto no map.
   No repo atualizado: git apply --check infra/edge/frontend-protocolo.patch, depois
   git apply infra/edge/frontend-protocolo.patch. Preserva o callback OIDC do Pedro
   e todos os demais ajustes. Se o check falhar, revisar o diff atual; nao substituir
   o arquivo completo por uma copia antiga. Rebuild/publicacao pelo responsavel.
6. Depois, executar verificar-borda.py --aplicacao. Exige todos os targets healthy,
   /healthz e /api/health/live retornando 200 pela origem publica real. Testar ainda
   login/Keycloak, IA, SSE, WebSocket, colaboracao e uploads como grupo. Sem esses
   testes, nao registrar aplicacao completa nem resiliencia de dados comprovada.

## WAF, privacidade e limites

Requests amostradas estao desabilitadas; nos logs WAF ocultam-se query string,
Authorization e Cookie, e guardam-se somente bloqueios. Logs podem conter IPs,
URI e outros metadados; acesso deve ser restrito. Logs de acesso do ALB nao sao
habilitados por este pacote. Preservar o ajuste do Pedro que nao registra code/state
no callback OIDC do Nginx; corrigir o map nao remove esse ajuste.

WAF no ALB inspeciona somente os primeiros 8 KiB do corpo. SizeRestrictions_BODY,
CrossSiteScripting_BODY, GenericLFI_BODY e GenericRFI_BODY ficam em Count, porque
documentos podem incluir HTML/caminhos/URLs e uploads maiores. Metricas continuam
ativas; regras de query/URI/cookies continuam com as acoes gerenciadas. Isto reduz
a protecao automatica no corpo e nao substitui validacao, sanitizacao, limites de
upload e autorizacao da aplicacao. Avaliar falsos positivos nos testes reais.
O rate limit e aproximado; varios usuarios atras do mesmo NAT podem compartilhar
o limite. A versao default dos grupos gerenciados pode ser atualizada pela AWS.

EC2, IPv4, ALB, NLB, WAF e logs acrescentam custos ao EKS/NAT/RDS. O saldo real do
Academy deve ser acompanhado; nao ha garantia de que um saldo estimado cubra ate
a entrega. Reset Lab apaga recursos. Nao aplicar destroy em states antigos por
engano; para desmontar depois da entrega, primeiro esta etapa e depois a base.

## Fontes oficiais

- https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-security-groups.html
- https://docs.aws.amazon.com/elasticloadbalancing/latest/application/https-listener-certificates.html
- https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/autoscaling_attachment
