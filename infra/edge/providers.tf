provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = [var.expected_account_id]
  default_tags {
    tags = {
      Project     = "as-docs"
      Environment = "academico"
      ManagedBy   = "Terraform"
      Stage       = "06-borda"
    }
  }
}

data "terraform_remote_state" "network" {
  count   = local.legacy_network && var.expected_account_id == "967931808920" ? 1 : 0
  backend = "s3"
  config = {
    bucket              = "as-docs-tfstate-967931808920-us-east-1"
    key                 = "as-docs/terraform.tfstate"
    region              = "us-east-1"
    encrypt             = true
    allowed_account_ids = ["967931808920"]
  }
}

locals {
  legacy_network = var.network_outputs == null
  tls_enabled    = var.acm_certificate_arn != ""

  legacy_outputs = local.legacy_network ? data.terraform_remote_state.network[0].outputs : null
  base = local.legacy_network ? {
    vpc_id                        = tostring(local.legacy_outputs.vpc_id)
    eks_cluster_name              = tostring(local.legacy_outputs.eks_cluster_name)
    eks_node_group_name           = tostring(local.legacy_outputs.eks_node_group_name)
    eks_cluster_security_group_id = tostring(local.legacy_outputs.eks_cluster_security_group_id)
    eks_autoscaling_group_name    = tostring(null) # O legado consulta o node group existente.
    public_subnets = tomap({
      for zone, subnet in local.legacy_outputs.public_subnets :
      zone => { id = tostring(subnet.id), cidr = tostring(subnet.cidr) }
    })
    private_subnets = tomap({
      for zone, subnet in local.legacy_outputs.private_subnets : zone => { id = tostring(subnet.id) }
    })
    security_group_ids = {
      alb      = tostring(local.legacy_outputs.security_group_ids.alb)
      frontend = tostring(local.legacy_outputs.security_group_ids.frontend)
    }
  } : var.network_outputs

  # Em uma criação nova, o ASG só existe depois do node group.
  backend_autoscaling_group_name = local.legacy_network ? one(one(data.aws_eks_node_group.backend[0].resources).autoscaling_groups).name : var.network_outputs.eks_autoscaling_group_name
}

data "aws_iam_instance_profile" "frontend" {
  name = var.frontend_instance_profile_name

  lifecycle {
    postcondition {
      condition = local.legacy_network ? (
        self.role_arn == "arn:aws:iam::967931808920:role/LabRole"
        ) : (
        can(regex("^arn:aws:iam::${var.expected_account_id}:role/.+$", self.role_arn))
      )
      error_message = "O perfil precisa usar uma role da conta selecionada (LabRole no modo legado)."
    }
  }
}

data "aws_ssm_parameter" "frontend_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

data "aws_eks_node_group" "backend" {
  count           = local.legacy_network ? 1 : 0
  cluster_name    = local.base.eks_cluster_name
  node_group_name = local.base.eks_node_group_name
}
