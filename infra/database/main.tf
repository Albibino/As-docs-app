resource "aws_security_group" "database" {
  name        = "as-docs-postgres"
  description = "PostgreSQL privado: conexoes apenas dos nos/pods EKS"
  vpc_id      = data.terraform_remote_state.network.outputs.vpc_id

  tags = { Name = "as-docs-postgres" }
}

resource "aws_vpc_security_group_ingress_rule" "eks_postgres" {
  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = data.terraform_remote_state.network.outputs.eks_cluster_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL a partir do grupo de seguranca dos nos EKS"
}

resource "aws_db_subnet_group" "private" {
  name        = "as-docs-postgres-private"
  description = "Sub-redes privadas existentes nas duas zonas"
  subnet_ids = [
    for zone in sort(keys(data.terraform_remote_state.network.outputs.private_subnets)) :
    data.terraform_remote_state.network.outputs.private_subnets[zone].id
  ]
  tags = { Name = "as-docs-postgres-private" }

  lifecycle {
    precondition {
      condition = (
        data.terraform_remote_state.network.outputs.vpc_id == "vpc-0a79932ef5165619e" &&
        length(data.terraform_remote_state.network.outputs.private_subnets) == 2
      )
      error_message = "O state consultado precisa corresponder a VPC e as duas sub-redes privadas ja verificadas."
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
  password_wo              = var.db_password
  password_wo_version      = var.db_password_revision
  port                     = 5432

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

  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "as-docs-postgres-final"
  tags                      = { Name = "as-docs-postgres" }

  lifecycle {
    prevent_destroy = true
  }
}
