# Plano real da etapa 05 recebido do CloudShell

O preflight passou: conta correta, schema do add-on confirmado e ausencia de
aplicacoes/PVCs. Init, fmt -check -recursive e validate passaram.

O usuario gerou volumes.tfplan no state original da rede/EKS. O plano mostrou:

| Recurso | Acao |
|---|---|
| aws_eks_node_group.private | Criar substituto e depois destruir o antigo |
| aws_launch_template.eks_nodes | Nova versao, hop limit de 1 para 2 |
| aws_eks_addon.ebs_csi[0] | Criar aws-ebs-csi-driver v1.68.1-eksbuild.1 |

Novo grupo as-docs-private-storage, role arn:aws:iam::967931808920:role/LabRole.
O cluster, a rede e NATs nao possuem mudancas no plano. O RDS possui state separado.

```text
Plan: 2 to add, 1 to change, 1 to destroy.
Saved the plan to: volumes.tfplan
```

O resultado do apply, a saude dos tres novos nos, os testes de persistencia e
o plano posterior ainda aguardam saida real. A regra de egress e a StorageClass
devem ser aplicadas antes do apply, conforme o guia da etapa.
