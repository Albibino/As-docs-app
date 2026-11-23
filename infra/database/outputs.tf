output "database_connection" {
  description = "Dados nao sensiveis para Muci configurar o backend; senha permanece no arquivo local ignorado."
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
