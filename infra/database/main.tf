locals {
  legacy_mode = var.network_outputs == null
  network = local.legacy_mode ? {
    vpc_id                        = data.terraform_remote_state.network[0].outputs.vpc_id
    eks_cluster_security_group_id = data.terraform_remote_state.network[0].outputs.eks_cluster_security_group_id
    private_subnets = tomap({
      for zone, subnet in data.terraform_remote_state.network[0].outputs.private_subnets :
      zone => { id = subnet.id }
    })
  } : var.network_outputs
}

resource "aws_security_group" "database" {
  name        = "as-docs-postgres"
  description = "PostgreSQL privado: conexoes apenas dos nos/pods EKS"
  vpc_id      = local.network.vpc_id

  tags = { Name = "as-docs-postgres" }
}

resource "aws_vpc_security_group_ingress_rule" "eks_postgres" {
  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = local.network.eks_cluster_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL a partir do grupo de seguranca dos nos EKS"
}

resource "aws_db_subnet_group" "private" {
  name        = "as-docs-postgres-private"
  description = "Sub-redes privadas existentes nas duas zonas"
  subnet_ids  = [for subnet in local.network.private_subnets : subnet.id]
  tags        = { Name = "as-docs-postgres-private" }

  lifecycle {
    precondition {
      condition     = !local.legacy_mode || local.network.vpc_id == "vpc-04354398b0920234a"
      error_message = "O state S3 legado deve corresponder à VPC já verificada."
    }

    precondition {
      condition = try(
        can(regex("^vpc-([0-9a-f]{8}|[0-9a-f]{17})$", local.network.vpc_id)) &&
        can(regex("^sg-([0-9a-f]{8}|[0-9a-f]{17})$", local.network.eks_cluster_security_group_id)) &&
        length(local.network.private_subnets) == 2 &&
        length(distinct([for subnet in local.network.private_subnets : subnet.id])) == 2 &&
        alltrue([
          for zone, subnet in local.network.private_subnets :
          can(regex("^us-east-1[a-z]$", zone)) && can(regex("^subnet-([0-9a-f]{8}|[0-9a-f]{17})$", subnet.id))
        ]), false
      )
      error_message = "Informe IDs válidos para a VPC e o grupo de segurança EKS, com duas sub-redes privadas distintas, uma por zona de disponibilidade em us-east-1."
    }
  }
}

resource "aws_db_parameter_group" "postgres" {
  name        = "as-docs-postgres18"
  family      = "postgres18"
  description = "PostgreSQL 18 com TLS obrigatorio"

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }
  tags = { Name = "as-docs-postgres18" }
}

resource "aws_db_instance" "postgres" {
  identifier = "as-docs-postgres"
  engine     = "postgres"
  # Suporte padrao; nao aderir automaticamente ao suporte estendido pago.
  engine_lifecycle_support = "open-source-rds-extended-support-disabled"
  engine_version           = var.db_engine_version
  instance_class           = var.db_instance_class
  db_name                  = "asdocs"
  username                 = "asdocs_admin"

  # O provider exige que o argumento de gerenciamento e a senha write-only sejam mutuamente exclusivos.
  manage_master_user_password = var.db_manage_master_user_password ? true : null
  password_wo                 = var.db_manage_master_user_password ? null : var.db_password
  password_wo_version         = var.db_manage_master_user_password ? null : var.db_password_revision
  port                        = 5432

  allocated_storage      = 20
  max_allocated_storage  = 100
  storage_type           = "gp2"
  storage_encrypted      = true
  multi_az               = true
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.private.name
  parameter_group_name   = aws_db_parameter_group.postgres.name
  vpc_security_group_ids = [aws_security_group.database.id]

  backup_retention_period     = 7
  backup_window               = "06:00-07:00"
  maintenance_window          = "sun:07:30-sun:08:30"
  copy_tags_to_snapshot       = true
  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false
  apply_immediately           = false
  # Enhanced Monitoring nao e suportado pelo Learner Lab.
  monitoring_interval          = 0
  performance_insights_enabled = false

  # prevent_destroy não pode variar por entrada; a proteção do legado fica no RDS.
  deletion_protection       = local.legacy_mode
  skip_final_snapshot       = !local.legacy_mode
  final_snapshot_identifier = local.legacy_mode ? "as-docs-postgres-final" : null
  tags                      = { Name = "as-docs-postgres" }
}
