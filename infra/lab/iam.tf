provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = var.expected_account_id == null ? null : [var.expected_account_id]
}

data "aws_caller_identity" "current" {}

# Vincula o state à primeira conta, mesmo sem o pin opcional em tfvars.
resource "terraform_data" "account" {
  input = data.aws_caller_identity.current.account_id

  lifecycle {
    ignore_changes = [input]
    postcondition {
      condition     = self.input == data.aws_caller_identity.current.account_id
      error_message = "Este state pertence a outra conta AWS. Volte às credenciais originais ou use um checkout com state separado."
    }
  }
}

locals {
  account_id   = terraform_data.account.input
  project_name = "as-docs"
  learner_lab  = var.iam_mode == "learner_lab"
  roles = local.learner_lab ? {} : merge({
    cluster  = { service = "eks.amazonaws.com", policies = ["AmazonEKSClusterPolicy"] }
    nodes    = { service = "ec2.amazonaws.com", policies = ["AmazonEKSWorkerNodePolicy", "AmazonEC2ContainerRegistryPullOnly", "AmazonEKS_CNI_Policy"] }
    frontend = { service = "ec2.amazonaws.com", policies = ["AmazonSSMManagedInstanceCore"] }
    }, var.eks_storage_enabled ? {
    ebs-csi = { service = "pods.eks.amazonaws.com", policies = ["AmazonEBSCSIDriverPolicyV2"] }
  } : {})
  role_policies = merge([for role, config in local.roles : {
    for policy in config.policies : "${role}/${policy}" => { role = role, policy = policy }
  }]...)
}

locals {
  learner_eks_roles = {
    cluster = { identifier = "LabEksClusterRole", arn = var.eks_cluster_role_arn }
    nodes   = { identifier = "LabEksNodeRole", arn = var.eks_node_role_arn }
  }
  eks_cluster_role_arn           = local.learner_lab ? (var.eks_cluster_role_arn != null ? var.eks_cluster_role_arn : try(one(data.aws_iam_roles.learner["cluster"].arns), null)) : terraform_data.eks_roles[0].input.cluster
  eks_node_role_arn              = local.learner_lab ? (var.eks_node_role_arn != null ? var.eks_node_role_arn : try(one(data.aws_iam_roles.learner["nodes"].arns), null)) : terraform_data.eks_roles[0].input.nodes
  frontend_instance_profile_name = local.learner_lab ? "LabInstanceProfile" : aws_iam_instance_profile.frontend[0].name
}

data "aws_iam_roles" "learner" {
  for_each = { for key, role in local.learner_eks_roles : key => role.identifier if local.learner_lab && role.arn == null }

  name_regex = "(^|-)${each.value}(-|$)"

  lifecycle {
    postcondition {
      condition     = length(self.arns) == 1
      error_message = "Esperava uma única role ${each.value} no Learner Lab. Confira a sessão e, se preciso, informe o ARN da role da sua conta em ${each.key == "cluster" ? "eks_cluster_role_arn" : "eks_node_role_arn"}."
    }
  }
}

resource "aws_iam_role" "workload" {
  for_each = local.roles
  name     = "${local.project_name}-lab-${each.key}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [merge({
      Effect    = "Allow"
      Action    = each.key == "ebs-csi" ? ["sts:AssumeRole", "sts:TagSession"] : ["sts:AssumeRole"]
      Principal = { Service = each.value.service }
      }, each.key == "ebs-csi" ? {
      Condition = { StringEquals = {
        "aws:RequestTag/eks-cluster-arn"            = "arn:aws:eks:us-east-1:${local.account_id}:cluster/${local.project_name}-eks"
        "aws:RequestTag/kubernetes-namespace"       = "kube-system"
        "aws:RequestTag/kubernetes-service-account" = "ebs-csi-controller-sa"
      } }
    } : {})]
  })
  tags       = { Project = local.project_name, ManagedBy = "Terraform" }
  depends_on = [terraform_data.account]
}

resource "aws_iam_role_policy_attachment" "workload" {
  for_each   = local.role_policies
  role       = aws_iam_role.workload[each.value.role].name
  policy_arn = "arn:aws:iam::aws:policy/${each.value.policy}"
}

# A base usa os ARNs apenas depois que as políticas estão associadas.
resource "terraform_data" "eks_roles" {
  count = local.learner_lab ? 0 : 1
  input = {
    cluster = aws_iam_role.workload["cluster"].arn
    nodes   = aws_iam_role.workload["nodes"].arn
  }
  depends_on = [aws_iam_role_policy_attachment.workload]
}

resource "aws_iam_instance_profile" "frontend" {
  count      = local.learner_lab ? 0 : 1
  name       = "${local.project_name}-lab-frontend"
  role       = aws_iam_role.workload["frontend"].name
  tags       = { Project = local.project_name, ManagedBy = "Terraform" }
  depends_on = [aws_iam_role_policy_attachment.workload["frontend/AmazonSSMManagedInstanceCore"]]
}

moved {
  from = terraform_data.eks_roles
  to   = terraform_data.eks_roles[0]
}

moved {
  from = aws_iam_instance_profile.frontend
  to   = aws_iam_instance_profile.frontend[0]
}
