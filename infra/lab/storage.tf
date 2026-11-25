locals {
  pod_identity_storage = !local.learner_lab && var.eks_storage_enabled
  storage_addons       = local.pod_identity_storage ? toset(["eks-pod-identity-agent", "aws-ebs-csi-driver"]) : toset([])
}

data "aws_eks_addon_version" "storage" {
  for_each = local.storage_addons

  addon_name         = each.key
  kubernetes_version = var.eks_version
  most_recent        = false
}

resource "aws_eks_addon" "pod_identity" {
  count = local.pod_identity_storage ? 1 : 0

  cluster_name                = module.base.eks_cluster_name
  addon_name                  = "eks-pod-identity-agent"
  addon_version               = data.aws_eks_addon_version.storage["eks-pod-identity-agent"].version
  resolve_conflicts_on_update = "PRESERVE"
  # O agente deve aguardar o grupo de nós privado.
  depends_on = [module.base]
}

resource "aws_eks_addon" "ebs_csi" {
  count = local.pod_identity_storage ? 1 : 0

  cluster_name                = module.base.eks_cluster_name
  addon_name                  = "aws-ebs-csi-driver"
  addon_version               = data.aws_eks_addon_version.storage["aws-ebs-csi-driver"].version
  resolve_conflicts_on_update = "PRESERVE"

  pod_identity_association {
    role_arn        = aws_iam_role.workload["ebs-csi"].arn
    service_account = "ebs-csi-controller-sa"
  }

  depends_on = [aws_eks_addon.pod_identity, aws_iam_role_policy_attachment.workload]
}
