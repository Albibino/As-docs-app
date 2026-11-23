variable "eks_storage_enabled" {
  description = "Etapa 05: usa a LabRole existente nos nos e instala o CSI EBS. Exige revisar a troca do node group."
  type        = bool
  default     = false
}

data "aws_iam_role" "storage_nodes" {
  count = var.eks_storage_enabled ? 1 : 0
  name  = "LabRole"
}

resource "aws_eks_addon" "ebs_csi" {
  count                       = var.eks_storage_enabled ? 1 : 0
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "aws-ebs-csi-driver"
  addon_version               = "v1.68.1-eksbuild.1"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "PRESERVE"
  configuration_values = jsonencode({
    node = { hostNetwork = true }
  })
  tags       = { Name = "${var.project_name}-ebs-csi", Stage = "05-volumes" }
  depends_on = [aws_eks_node_group.private]
}

output "storage_integration" {
  value = var.eks_storage_enabled ? {
    addon_version = aws_eks_addon.ebs_csi[0].addon_version
    node_role     = data.aws_iam_role.storage_nodes[0].arn
    storage_class = "gp3"
  } : null
}
