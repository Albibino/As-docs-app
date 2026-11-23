mock_provider "aws" {}

run "state_privado_versionado_e_criptografado" {
  command = plan

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.state.block_public_acls,
      aws_s3_bucket_public_access_block.state.block_public_policy,
      aws_s3_bucket_public_access_block.state.ignore_public_acls,
      aws_s3_bucket_public_access_block.state.restrict_public_buckets,
    ])
    error_message = "O bucket de state deve bloquear todas as formas de acesso público."
  }

  assert {
    condition     = one(aws_s3_bucket_versioning.state.versioning_configuration).status == "Enabled"
    error_message = "O bucket deve manter versões anteriores do state."
  }

  assert {
    condition     = one(one(aws_s3_bucket_server_side_encryption_configuration.state.rule).apply_server_side_encryption_by_default).sse_algorithm == "AES256"
    error_message = "O bucket deve habilitar criptografia padrão AES256."
  }

  assert {
    condition     = aws_s3_bucket.state.force_destroy == false
    error_message = "A exclusão forçada de um bucket com state deve estar desabilitada."
  }
}
