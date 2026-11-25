terraform {
  required_version = ">= 1.11.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

# Sem backend remoto: esta raiz guarda um único state local para o laboratório.
module "base" {
  source = "../terraform"

  aws_region           = "us-east-1"
  project_name         = local.project_name
  expected_account_id  = local.account_id
  eks_version          = var.eks_version
  eks_cluster_role_arn = local.eks_cluster_role_arn
  eks_node_role_arn    = local.eks_node_role_arn
  eks_api_access_cidrs = var.eks_api_access_cidrs
  # O Learner Lab usa a LabRole existente. Em conta comum usa-se Pod Identity.
  eks_storage_enabled = local.learner_lab && var.eks_storage_enabled
}

locals {
  network = {
    vpc_id                        = module.base.vpc_id
    public_subnets                = module.base.public_subnets
    private_subnets               = module.base.private_subnets
    security_group_ids            = module.base.security_group_ids
    eks_cluster_name              = module.base.eks_cluster_name
    eks_cluster_security_group_id = module.base.eks_cluster_security_group_id
    eks_node_group_name           = module.base.eks_node_group_name
    eks_autoscaling_group_name    = module.base.eks_autoscaling_group_name
  }
}

module "database" {
  source = "../database"

  expected_account_id            = local.account_id
  network_outputs                = local.network
  db_engine_version              = var.db_engine_version
  db_instance_class              = var.db_instance_class
  db_manage_master_user_password = !local.learner_lab
  db_password                    = var.db_password
  db_password_revision           = var.db_password_revision
}

module "edge" {
  source = "../edge"

  expected_account_id            = local.account_id
  network_outputs                = local.network
  frontend_instance_profile_name = local.frontend_instance_profile_name
  public_hostname                = var.public_hostname
  acm_certificate_arn            = var.acm_certificate_arn
  keycloak_enabled               = local.keycloak_enabled
  keycloak_lab_http              = local.keycloak_lab_http
  keycloak_ai_oauth              = var.lab_full_deploy || var.ai_oauth != null
  keycloak_db_host               = local.keycloak_enabled ? module.database.database_connection.host : ""
  keycloak_bootstrap_id          = one(terraform_data.bootstrap_db[*].id)
}

output "eks_cluster_name" {
  value = module.base.eks_cluster_name
}

output "aws_account_id" {
  value = local.account_id
}

output "database_connection" {
  value = module.database.database_connection
}

output "db_master_user_secret_arn" {
  value = module.database.db_master_user_secret_arn
}

output "public_app_url" {
  value = module.edge.public_app_url
}

output "backend_url" {
  value = module.edge.backend_url
}

output "frontend_instances" {
  value = module.edge.frontend_instances
}

output "keycloak_issuer" {
  value = module.edge.keycloak_issuer
}
