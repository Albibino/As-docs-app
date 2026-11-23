locals {
  eks_core_addons = toset(["vpc-cni", "kube-proxy", "coredns"])
}

data "aws_eks_addon_version" "core" {
  for_each = local.eks_core_addons

  addon_name         = each.key
  kubernetes_version = var.eks_version
  most_recent        = false
}

resource "aws_eks_addon" "core" {
  for_each = local.eks_core_addons

  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = each.key
  addon_version               = data.aws_eks_addon_version.core[each.key].version
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
  configuration_values        = each.key == "vpc-cni" ? jsonencode({ enableNetworkPolicy = "true" }) : null

  tags = {
    Project = var.project_name
    Stage   = "03-eks"
  }

  depends_on = [aws_eks_node_group.private]
}
