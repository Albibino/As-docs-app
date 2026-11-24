provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = ["362749056012"]
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
  backend = "s3"
  config = {
    bucket              = "as-docs-tfstate-362749056012-us-east-1"
    key                 = "as-docs/terraform.tfstate"
    region              = "us-east-1"
    encrypt             = true
    allowed_account_ids = ["362749056012"]
  }
}

locals {
  base        = data.terraform_remote_state.network.outputs
  tls_enabled = var.acm_certificate_arn != ""
}

data "aws_iam_instance_profile" "frontend" {
  name = "LabInstanceProfile"
}

data "aws_ssm_parameter" "frontend_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

data "aws_eks_node_group" "backend" {
  cluster_name    = local.base.eks_cluster_name
  node_group_name = local.base.eks_node_group_name
}
