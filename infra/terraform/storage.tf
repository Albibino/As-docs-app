variable "eks_storage_enabled" {
  description = "Instala o CSI EBS com a role dos nós. Exige revisar a troca do node group."
  type        = bool
  default     = false
}

variable "eks_storage_use_configured_node_role" {
  description = "Usa a role informada em eks_node_role_arn com o CSI. O modo legado conserva a LabRole."
  type        = bool
  default     = false
}

locals {
  use_legacy_storage_role = var.eks_storage_enabled && !var.eks_storage_use_configured_node_role
  effective_node_role_arn = local.use_legacy_storage_role ? data.aws_iam_role.storage_nodes[0].arn : var.eks_node_role_arn
}

data "aws_iam_role" "storage_nodes" {
  count = local.use_legacy_storage_role ? 1 : 0
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
    node_role     = local.effective_node_role_arn
    storage_class = "gp3"
  } : null
}
