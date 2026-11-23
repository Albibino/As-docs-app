# EKS no Academy — etapa 03 aplicada

O usuário confirmou as funções existentes do EKS: cluster role com confiança no
serviço EKS e `AmazonEKSClusterPolicy`; node role com confiança no EC2 e as
políticas WorkerNode, ECR ReadOnly e CNI. Não há políticas inline. A consulta de
versões da conta retornou `1.37`, em suporte padrão.

A etapa acrescenta ao mesmo projeto e state 13 recursos: dois EIPs, dois NATs,
duas rotas privadas, grupo de logs, cluster, launch template, node group e três
add-ons. Não modifica o endereçamento nem os nomes dos recursos da rede existente.

O node group mantém três nós `t3.medium` On-Demand nas duas sub-redes privadas.
O template exige IMDSv2, impede IP público, usa disco raiz gp3 criptografado de
20 GiB e deixa AMI/bootstrap AL2023 a cargo do EKS. A API privada atende os nós;
a API pública permite somente os IPv4 `/32` configurados pelos operadores.

O helper identifica o IP atual do CloudShell e gera um arquivo de variáveis local,
ignorado pelo Git. O VPC CNI recebe suporte a NetworkPolicy. Os add-ons são
convertidos para gerenciados depois de o node group ficar ativo, usando versões
padrão compatíveis consultadas da API.

As permissões da node role não incluem EBS CSI ou Load Balancer Controller. As
políticas de Auto Mode presentes na cluster role não substituem essa integração
em nós gerenciados comuns. Esta etapa prepara a base; persistência, NLB e deploy
dos manifests existentes dependem da próxima integração. Não são criadas funções
ou políticas IAM por este código.

Guia de execução em `infra/terraform/ETAPA_03_EKS.md`. Validate e os três testes
de rede passaram no CloudShell. O teste positivo EKS foi corrigido para usar
apply simulado e um ID válido de launch template; os três testes EKS passaram na
reexecução filtrada. O plano real e o apply concluíram 13 adições, nenhuma
alteração e nenhuma exclusão. O total é de 35 recursos gerenciados no mesmo state
S3. O cluster chama-se `as-docs-eks` e o node group `as-docs-private`.

A sessão do laboratório encerrou depois do apply. Na retomada, o Terraform
inicializou o mesmo backend S3 e atualizou somente o IPv4 /32 autorizado à API.
O apply de retomada concluiu 0 adições, 1 alteração e 0 exclusões.

A conferência Kubernetes confirmou três nós Ready, todos sem IP público, em duas
sub-redes privadas: um em 10.0.10.0/24 e dois em 10.0.11.0/24. Os oito pods do
sistema estão Running, com todas as réplicas prontas e zero reinícios. O plano
posterior retornou No changes. A base EKS está verificada; persistência,
balanceador e workloads da aplicação continuam pendentes. Evidências em
`infra/terraform/evidencias/2026-11-22-aplicacao-eks.md` e
`infra/terraform/evidencias/2026-11-22-conferencia-eks.txt`.
