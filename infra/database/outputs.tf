output "database_connection" {
  description = "Dados não sensíveis para configurar a conexão ao banco; não inclui a senha."
  value = {
    host        = aws_db_instance.postgres.address
    port        = aws_db_instance.postgres.port
    database    = aws_db_instance.postgres.db_name
    username    = aws_db_instance.postgres.username
    sslmode     = "require"
    instance_id = aws_db_instance.postgres.identifier
    multi_az    = aws_db_instance.postgres.multi_az
  }
}

output "database_security_group_id" {
  value = aws_security_group.database.id
}

output "db_master_user_secret_arn" {
  description = "ARN do segredo da senha mestra no Secrets Manager, ou nulo no modo não gerenciado."
  value       = var.db_manage_master_user_password ? one(aws_db_instance.postgres.master_user_secret[*].secret_arn) : null
}
