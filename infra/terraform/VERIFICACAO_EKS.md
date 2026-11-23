# Verificação da implantação EKS

## Atualizacao de 23/11/2026 — etapa 05 concluida

O grupo atual e as-docs-private-storage com LabRole existente. A interrupcao
do primeiro apply foi recuperada com backup, liberacao do bloqueio proprio e
import do CSI existente. O apply de retomada removeu o grupo antigo; o teste
real conferiu tres nos Ready sem IP publico, rollouts do CSI, escrita, leitura
apos recriar workload e bloqueio IMDS em regime estavel. A limpeza do teste
terminou e o plano final retornou No changes. Ver evidencia detalhada em
[2026-11-23-conclusao-volumes.md](evidencias/2026-11-23-conclusao-volumes.md).
As secoes seguintes preservam a verificacao anterior da etapa 03.

## Resultado confirmado em 22/11/2026

O usuário enviou a execução real do CloudShell. `init`, `fmt -check -recursive`
e `validate` passaram. Os três testes de rede passaram na execução inicial;
depois das correções dos fixtures, os três testes EKS também passaram:
`Success! 3 passed, 0 failed.` na execução filtrada do arquivo EKS.

O plano real acrescentou 13 recursos, sem alterar nem excluir a rede existente.
O apply terminou com `Resources: 13 added, 0 changed, 0 destroyed.` O cluster
`as-docs-eks`, node group `as-docs-private`, dois NATs e três add-ons foram
criados. O total declarado é de 35 recursos gerenciados: 22 anteriores e 13 novos.

A conferência recebida confirmou três nós `Ready`, todos sem IP público, em
sub-redes das duas zonas. Os oito pods listados em `kube-system` estão `Running`,
com todas as réplicas prontas e zero reinícios. O novo plano retornou
`No changes. Your infrastructure matches the configuration.`
Os workloads da aplicação ainda não foram implantados por esta etapa.
IDs e versões estão em
[evidencias/2026-11-22-aplicacao-eks.md](evidencias/2026-11-22-aplicacao-eks.md).
Saída da conferência em
[evidencias/2026-11-22-conferencia-eks.txt](evidencias/2026-11-22-conferencia-eks.txt).

## Retomada após encerramento do laboratório

O usuário reiniciou o laboratório, carregou o helper e inicializou o backend S3.
O novo IP do CloudShell exigiu apenas a atualização de `public_access_cidrs` do
cluster. O plano retornou 0 adições, 1 alteração e 0 exclusões; o apply concluiu
com esses mesmos totais. A conferência Kubernetes e o plano sem diferenças
acima foram executados depois dessa atualização.

## Informações reais já recebidas

As duas funções IAM existem na conta confirmada. O usuário consultou confiança,
políticas anexadas e políticas inline: cluster role confia no EKS e tem
`AmazonEKSClusterPolicy`; node role confia no EC2 e tem WorkerNode, ECR ReadOnly
e CNI. A conta informou Kubernetes `1.37` em suporte padrão. O state S3 da rede
foi inicializado e seu plano posterior mostrou `No changes`.

## Verificação local da nova preparação

- Formatação HCL e sintaxe dos scripts são conferidas antes de empacotar.
- O helper de acesso é exercitado com comandos simulados para rejeitar conta
  diferente, falha de consulta do IP e resposta inválida; o caminho de sucesso
  gera apenas um IPv4 público `/32` no arquivo local.
- Os novos testes Terraform verificam três nós sem IP público em sub-redes
  privadas, NAT por zona, IMDSv2, funções existentes, suporte a NetworkPolicy e
  rejeição de API aberta ou instância maior que a entrega.

A comunicação com o provider usa sockets Unix que o ambiente local de preparação
não permite. Por isso, as verificações com provider e o plano real dependem do
CloudShell. Os resultados acima foram recebidos desse ambiente; não são
resultados de execução local.

## Primeira execução da etapa 03 no CloudShell

O usuário concluiu `init`, `fmt -check -recursive` e `validate` com sucesso.
Os três testes anteriores de rede passaram. A primeira execução positiva do
teste EKS falhou com `Unknown condition value`: as comparações usavam IDs
calculados durante um `command = plan`, antes da geração de valores pelo mock.
As duas execuções seguintes desse arquivo foram ignoradas após essa falha.

O teste positivo foi corrigido para `command = apply`, mantendo exclusivamente
o `mock_provider "aws"` já definido no arquivo. Esse apply é simulado, usa state
de teste e não cria recursos AWS. As verificações e os dois casos negativos foram
preservados. Na reexecução, a validação do node group rejeitou o ID genérico
gerado pelo mock para o launch template, que precisa começar com `lt-`.
O fixture foi corrigido com um ID fictício no formato aceito pelo provider e
versão 1. As referências seguintes foram revisadas: nome do cluster e ARN dos
nós vêm da configuração, e a versão dos add-ons já tem fixture explícito.
A nova execução recebida passou nos três testes EKS. Essa correção não
modificou nenhum arquivo Terraform de recursos nem o plano real existente.

Nenhum EKS, nó, NAT ou add-on foi criado durante a preparação local. A criação
real foi realizada pelo usuário no CloudShell e está registrada acima.
