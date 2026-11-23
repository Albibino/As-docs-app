# Banco no Academy — etapa 04A aplicada

O grupo informou PostgreSQL 18 para o As-docs-app. Os manifests usam banco
`asdocs`, porta 5432 e URL PostgreSQL com `sslmode=require`. Redis 8 permanece
como StatefulSet compartilhado entre app e IA; não será substituído por outro
serviço nesta etapa. Muci é o responsável pelo deploy/configuração dos serviços,
conforme a divisão lembrada pelo usuário; Pedro integra o Keycloak.

`infra/database` prepara cinco recursos para um RDS privado: SG, regra de entrada
do SG dos nós EKS, subnet group com as duas sub-redes privadas, parameter group
postgres18 com TLS obrigatório e DB instance. A instância usa Multi-AZ com um
standby, gp2 criptografado de 20 GiB, crescimento limitado a 100 GiB e backups de
7 dias. Enhanced Monitoring fica desligado, conforme a restrição do laboratório.

O helper consulta conta, versões e combinações de classe/armazenamento/zonas
disponíveis. Gera localmente senha aleatória, efêmera no Terraform, entregue ao
argumento `password_wo` sem persistência no plano ou state. Os arquivos locais de
variáveis não entram no Git nem nos ZIPs.

O backend usa `as-docs/database.tfstate` no bucket já existente. A configuração
apenas lê outputs de `as-docs/terraform.tfstate`; não altera os 35 recursos já
gerenciados pela rede/EKS. O plano esperado é cinco adições neste state novo.
O usuario concluiu validate, plano e apply no CloudShell: PostgreSQL 18.6,
db.t3.micro, cinco recursos criados e plano posterior No changes. Endpoint
as-docs-postgres.calk1qmjb2wt.us-east-1.rds.amazonaws.com, banco asdocs, porta
5432. Guia em `infra/database/README.md`, entrega em
`infra/database/ENTREGA_AO_MUCI.md` e evidencia em
`infra/database/evidencias/2026-11-22-aplicacao-banco.md`.

A consulta IAM recebida não encontrou roles com EBS/CSI no nome. A confiança
da LabRole inclui serviços AWS e ela própria, sem OIDC/identidade de pod.
Armazenamento gp3 no EKS continua pendente de integração autorizada. Nenhuma
confiança, política IAM ou SCP foi alterada para contornar a restrição.

O teste de restauração e a medição de RPO/RTO continuam pendentes. Multi-AZ e
retenção automática não comprovam, sozinhos, o requisito completo de DR.
