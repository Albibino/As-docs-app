# As-docs — infraestrutura Terraform no AWS Academy

**Etapa 05 aplicada e verificada em 23/11/2026:** grupo as-docs-private-storage
com tres nos privados e LabRole existente, CSI EBS e StorageClass gp3. O teste
real confirmou escrita, leitura apos recriar workload e bloqueio IMDS em regime
estavel. Objetos temporarios removidos; plano final No changes. Esta configuracao
tem 36 recursos gerenciados; o banco em `../database` tem outros cinco em state
separado. Veja [ETAPA_05_VOLUMES.md](ETAPA_05_VOLUMES.md).

A rede já foi aplicada na conta `967931808920`, região `us-east-1`: 22 recursos,
VPC `vpc-04354398b0920234a` e plano posterior `No changes`. O state foi migrado para
S3 e verificado novamente com os 22 recursos gerenciados e plano sem diferenças.

A etapa 03 também foi aplicada: EKS 1.37, grupo configurado com três nós privados,
NAT por zona, logs e add-ons de rede/DNS. **Validate e os testes simulados
passaram; o apply criou 13 recursos, sem alterações ou exclusões.** O total
declarado é de 35 recursos gerenciados. A conferência confirmou três nós `Ready`
sem IP público, pods do sistema `Running` e plano posterior `No changes`.
O roteiro está em
[ETAPA_03_EKS.md](ETAPA_03_EKS.md).

## Estado e escopo

| Componente | Situação |
|---|---|
| VPC, quatro sub-redes em duas zonas, IGW, tabelas/rota pública e SGs | Aplicados e verificados: 22 recursos Terraform. |
| Backend S3 com criptografia e bloqueio nativo | Migração concluída e verificada. |
| EKS 1.37, três nós privados e NAT por zona | Apply concluído; três nós Ready sem IP público e plano No changes confirmados. |
| Add-ons VPC CNI, kube-proxy e CoreDNS | Criados; NetworkPolicy habilitado no CNI. |
| RDS | Aplicado em ../database: cinco recursos, plano No changes. |
| Persistencia/CSI | Aplicada e verificada em volume temporario; PVCs reais entram no deploy. |
| NLB, EC2 frontend, ALB/WAF e deploy | Proximas etapas de integracao. |
| Backups e restauração de dados | Necessários para concluir o plano de DR. |

Nenhuma função ou política IAM é criada por este código. `terraform.tfvars` tem
os IDs e ARNs existentes, sem credenciais. As consultas do usuário confirmaram as
politicas basicas do cluster e dos nos. O CSI usa a LabRole do laboratorio,
com as limitacoes de isolamento documentadas na etapa 05. A integracao do
balanceador interno continua pendente.

## Retomar no CloudShell

A instalação de sistema pode desaparecer ao reciclar o CloudShell. O usuário
preservou Terraform em `$HOME/.local/bin`. Se ele estiver ausente, use a instalação
oficial HashiCorp para Amazon Linux e copie o executável para esse diretório.

O provider AWS é grande para o armazenamento pessoal de 1 GB. Carregue o helper
para guardar apenas dados regeneráveis em `/var/tmp`; código e backups locais
ficam no diretório pessoal, e o state ativo fica no S3.

```bash
cd "$HOME/as-docs-terraform-etapa-01"
source ./cloudshell-env.sh
bash ./preparar-eks.sh
TMPDIR=/var/tmp terraform init
terraform fmt -check -recursive
terraform validate
terraform test
terraform plan -out=eks.tfplan
```

`preparar-eks.sh` identifica o IP público atual do CloudShell e grava um `/32`
no arquivo local `eks-acesso.auto.tfvars`, ignorado pelo Git. O endpoint privado
atende os nós; o endpoint público da API é restrito aos operadores configurados.
A rede, o EKS e o CSI ja estao no state remoto e foram verificados apos a etapa
05. A retomada com as mesmas variaveis deve produzir No changes.
Se o IP do CloudShell
mudou, analise a atualização da lista de acesso da API antes de aplicar.

## Backend e colaboração

`backend.tf` aponta para o bucket `as-docs-tfstate-967931808920-us-east-1`, chave
`as-docs/terraform.tfstate`, com `use_lockfile = true`. Ele pode ser versionado,
junto com `.terraform.lock.hcl`. O backend não filtra o ID da conta da sessão,
mas o acesso ao state e ao lock continua dependendo das permissões do S3. Em
um diretório já inicializado, use `terraform init -reconfigure` para recarregar
a configuração sem migrar o state.

Para implantar em outra conta, use um bucket e um state próprios via
`-backend-config`, configure `expected_account_id` e os ARNs das roles do EKS
para essa conta. Não reaproveite o state da implantação existente. Os stacks
de banco e borda têm configurações separadas e não foram alterados.

States, backups, planos, providers, credenciais e o arquivo local de IP ficam
fora do Git. Não mova o projeto inteiro para `/tmp` ou `/var/tmp`. Não reaplique
`rede.tfplan` nem repita o helper inicial de migração, que já foi concluída.

Para a inclusão no As-docs-app, esta pasta corresponde a `infra/terraform`.
O apoio ao state está em `infra/state-backend`. William confirmou três nós EKS;
Kubernetes distribui os serviços pelos nós sem dedicação obrigatória por serviço.

## Evidências e referências

- [VERIFICACAO.md](VERIFICACAO.md): validação, aplicação da rede e migração S3.
- [VERIFICACAO_EKS.md](VERIFICACAO_EKS.md): alcance da verificação desta preparação.
- [ENTREGA_AO_GRUPO.md](ENTREGA_AO_GRUPO.md): IDs e continuidade da infraestrutura.
- [Etapas e políticas confirmadas](evidencias/2026-11-22-pre-requisitos-eks.md).
- [Apply EKS concluído](evidencias/2026-11-22-aplicacao-eks.md).
- [Conferência dos nós e convergência](evidencias/2026-11-22-conferencia-eks.txt).
- [Backend S3](https://developer.hashicorp.com/terraform/language/backend/s3).
- [Instalação Terraform](https://developer.hashicorp.com/terraform/install).
- Readme do Learner Lab fornecido pelo usuário: restrições de conta/região,
  tamanhos de instância, armazenamento e permissões.
