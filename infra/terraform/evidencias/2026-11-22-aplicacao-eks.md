# Aplicação EKS — resultado recebido do CloudShell

Data informada pela sessão do usuário: 22/11/2026. A execução foi feita no
CloudShell da conta `967931808920`, região `us-east-1`, preservando a rede
existente e o backend S3 `as-docs-tfstate-967931808920-us-east-1`, chave
`as-docs/terraform.tfstate`.

## Validação e aplicação

- `terraform init`: concluído.
- `terraform fmt -check -recursive`: sem saída de diferenças.
- `terraform validate`: `Success! The configuration is valid.`
- Três testes de rede passaram na execução inicial.
- Após corrigir o modo do teste e o ID do mock, os três testes EKS passaram:
  `Success! 3 passed, 0 failed.`
- Plano real: `13 to add, 0 to change, 0 to destroy`, salvo em `eks.tfplan`.
- `terraform apply eks.tfplan`:

```text
Apply complete! Resources: 13 added, 0 changed, 0 destroyed.
```

Os 13 recursos acrescentados somam-se aos 22 gerenciados da rede: 35 recursos
Terraform. Instâncias e ASG subordinados ao node group não entram nessa contagem
como recursos Terraform separados.

## Identificadores e versões retornados

| Item | Resultado |
|---|---|
| Cluster | `as-docs-eks` — Kubernetes `1.37` |
| Node group | `as-docs-private` |
| Launch template | `lt-0d9d86f1a31f087d7` |
| Grupo de segurança do cluster | `sg-0a3d3f64bea7b6b6e` |
| Logs | `/aws/eks/as-docs-eks/cluster` |
| NAT us-east-1a | `nat-0581b6cf974af20ee` — `32.202.94.119` |
| NAT us-east-1b | `nat-0ca37920f417edc2e` — `35.169.147.177` |
| CoreDNS | `v1.14.7-eksbuild.35` |
| kube-proxy | `v1.37.0-eksbuild.39` |
| VPC CNI | `v1.22.4-eksbuild.14` |

O node group está configurado com mínimo/desejado/máximo 3, instâncias
`t3.medium` nas duas sub-redes privadas e sem IP público. A criação do cluster
levou 11m26s; a do node group, 1m57s. Os três add-ons concluíram a criação.

## Conferência concluída após a retomada

```bash
aws eks update-kubeconfig --region us-east-1 --name as-docs-eks
kubectl get nodes -o wide
kubectl get pods -n kube-system
terraform plan
```

O usuário reiniciou o laboratório e atualizou o IPv4 /32 autorizado à API do
cluster. O plano de retomada e o apply concluíram 0 adições, 1 alteração e 0
exclusões. Depois, a conferência confirmou três nós `Ready`, sem IP público,
e oito pods do sistema `Running`, com todas as réplicas prontas e zero reinícios.
O novo plano retornou `No changes. Your infrastructure matches the configuration.`

Saída em [2026-11-22-conferencia-eks.txt](2026-11-22-conferencia-eks.txt).
Aplicação, IA, Redis, PostgreSQL, Keycloak, frontends e balanceadores não foram
implantados por esta etapa.
