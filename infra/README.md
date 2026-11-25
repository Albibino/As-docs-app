# Infraestrutura do As-docs

Para provisionar em uma conta própria do AWS Academy, comece pelo
[laboratório individual](lab/README.md). Ele não usa os states abaixo.

## Implantação compartilhada anterior

Atualizacao em 23/11/2026, conta 967931808920, regiao us-east-1.

| Pasta | Estado e uso |
|---|---|
| terraform/ | Rede, EKS e CSI aplicados: 36 recursos gerenciados. Na retomada, tres novos nos Ready sem IP publico e novo teste de volume aprovado. |
| database/ | PostgreSQL 18.6 privado Multi-AZ, backups e cinco recursos em state proprio; plano apos a criacao No changes. Na retomada, banco available. |
| edge/ | Duas EC2 frontend, ALB, NLB interno e WAF: 20 recursos aplicados. Verificacao de infraestrutura aprovada e plano posterior No changes. |
| state-backend/ | Bucket S3 configurado por CLI apos restricao Object Lock; privado, criptografado e versionado. Nao reaplicar o bootstrap Terraform antigo. |

Sao 61 recursos Terraform em tres states: as-docs/terraform.tfstate,
as-docs/database.tfstate e as-docs/edge.tfstate. O bucket de apoio nao entra nessa
contagem. Codigo, lock files e evidencias entram no Git; state, planos, senhas,
providers e configuracoes locais de acesso permanecem fora dele.

A base CSI foi validada com escrita, leitura apos recriar workload e bloqueio
IMDS em regime estavel. A LabRole nos nos e a janela inicial do VPC CNI standard
permanecem como excecao de laboratorio documentada; nao sao isolamento IAM por pod.
Na retomada houve falha KMS em lancamentos, depois tres lancamentos Successful;
a proposta de nova chave foi retirada sem apply. O ultimo status administrativo
consultado do node group ainda era DEGRADED, embora os nos e o teste real
estivessem funcionais. Ver terraform/evidencias/2026-11-23-retomada-lab.md.

A provisao da borda foi concluida; nao representa aplicacao implantada. Os dois
targets frontend estavam unhealthy e os tres backend em initial no momento da
verificacao. Muci deve publicar os containers reais e substituir somente o bloco
Service do backend pelo NodePort entregue em edge/backend-service.yaml.
O NLB e gerenciado pelo Terraform, sem AWS Load Balancer Controller.

HTTPS nao foi habilitado: faltam dominio/certificado confirmados e DNS do grupo.
A origem HTTP e temporaria. A configuracao aceita ACM real em us-east-1 e prepara
listener TLS/redirect quando esses dados forem informados. Login/Keycloak, IA,
SSE/WebSocket, colaboracao, uploads e restauracao de backups ainda exigem testes.
O provisionamento opt-in do Keycloak está em [edge/KEYCLOAK.md](edge/KEYCLOAK.md).

Entrega pratica em edge/ENTREGA_AO_MUCI.md e database/ENTREGA_AO_MUCI.md.
O acesso ao GitHub nao concede acesso AWS; usar sessao autorizada nesta conta.
Cada pasta exige seu proprio cloudshell-env.sh e init. Nao inicializar state vazio
para gerenciar a base existente nem reaplicar helpers da migracao inicial.
