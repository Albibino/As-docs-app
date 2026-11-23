# Infraestrutura AWS Academy com Terraform

A infraestrutura da adaptação para o trabalho de Auditoria e Segurança de
Sistemas fica em `infra/terraform`, com instruções no README dessa pasta.

## Etapa 01 — rede

Implementa VPC, duas sub-redes públicas, duas privadas, Internet Gateway, rotas
públicas e grupos de segurança do ALB e do frontend. O CIDR padrão `10.0.0.0/16`
mantém compatibilidade com as faixas dos manifests Kubernetes recebidos.

O provider limita a execução à conta confirmada pelo usuário; as variáveis aceitam
somente as duas regiões permitidas pelo laboratório. Os ARNs das funções existentes
do cluster e dos nós EKS estão em `terraform.tfvars`. Nenhuma função IAM é criada.

NAT, computação, RDS, ALB, WAF e deploy são etapas seguintes. As sub-redes privadas
têm apenas rotas locais até a configuração da saída NAT. O state é local nesta
etapa; sua migração para S3 está preparada em `infra/state-backend`, ainda sem
execução. O usuário confirmou a continuidade na mesma conta AWS.

## Pendências

O desenho tem dois ícones RDS e um DynamoDB; os projetos recebidos usam um
endpoint PostgreSQL e Redis 8, sem integração DynamoDB identificada. William
confirmou PostgreSQL 18, Redis 8 e Redis com Vector Sets para a IA. Os manifests
compartilham uma instância Redis, usando DB 1 para o app e DB 0 para a IA.

William confirmou que as três máquinas privadas serão três nós do EKS, alinhados
aos manifests recebidos. As políticas das funções existentes ainda devem ser
conferidas antes de provisionar o cluster. Pedro integrará o Keycloak e Micdu
poderá ajustar CI/CD/SonarQube. Backups e testes de recuperação dos dados ainda
completarão a demonstração de DR.

## Validação

A preparação local concluiu `init` e a conferência de formatação. A validação com
o provider foi bloqueada pela restrição de sockets Unix desse ambiente. Depois,
o usuário concluiu no CloudShell a validação, os 3 testes simulados, o plano, a
aplicação e um plano posterior sem diferenças. Nenhum recurso AWS foi criado
durante a preparação local. Ver `infra/terraform/VERIFICACAO.md`.

## Espaço do CloudShell

O `init` real no laboratório falhou ao extrair o provider por falta de espaço no
diretório pessoal. O diagnóstico mostrou espaço disponível em `/var/tmp`.
`cloudshell-env.sh` configura `TF_DATA_DIR` nessa área para dados regeneráveis;
o `init` também usa `TMPDIR=/var/tmp`. Código e state permanecem no diretório
pessoal. A variável deve ser carregada em cada nova sessão, repetindo o `init`
quando o ambiente temporário for reciclado.

## Resultado no laboratório em 22/11/2026

Após mover os dados regeneráveis para `/var/tmp`, o usuário concluiu o `init`,
obteve configuração válida, 3 testes simulados aprovados e um plano de 22 adições,
sem alterações ou exclusões. O plano usa `us-east-1a` e `us-east-1b` e contempla
somente a rede desta etapa. Evidência completa em
`infra/terraform/evidencias/2026-11-22-validacao-e-plano.txt`.

A retomada de sessão confirmou a preservação do código e do plano no diretório
pessoal. O executável Terraform foi copiado para `$HOME/.local/bin`; o script de
ambiente configura também `PATH`. O novo `init` concluiu e o plano permaneceu com
as mesmas 22 adições. Em seguida, o usuário aplicou o plano: 22 recursos criados,
nenhuma alteração e nenhuma exclusão. Um novo plano retornou `No changes`.

Evidência em `infra/terraform/evidencias/2026-11-22-aplicacao-e-convergencia.txt`.
A VPC criada é `vpc-04354398b0920234a`, conta `967931808920`, `us-east-1`.
Os IDs e a orientação de continuidade estão em `infra/terraform/ENTREGA_AO_GRUPO.md`.
