mock_provider "aws" {
  mock_resource "aws_security_group" {
    defaults = { id = "sg-0123456789abcdef0" }
  }
}

variables {
  db_instance_class = "db.t4g.micro"
  db_engine_version = "18.1"
}

override_data {
  target          = data.terraform_remote_state.network
  override_during = plan
  values = {
    outputs = {
      vpc_id                        = "vpc-04354398b0920234a"
      eks_cluster_security_group_id = "sg-0a3d3f64bea7b6b6e"
      private_subnets = {
        us-east-1a = { id = "subnet-02ad1d11473fac085", cidr = "10.0.10.0/24" }
        us-east-1b = { id = "subnet-063bcd96ac81fc44d", cidr = "10.0.11.0/24" }
      }
    }
  }
}

run "senha_mestra_gerenciada_sem_senha_fornecida" {
  command = plan

  variables {
    db_manage_master_user_password = true
    network_outputs = {
      vpc_id                        = "vpc-0123456789abcdef0"
      eks_cluster_security_group_id = "sg-00112233445566778"
      private_subnets = {
        us-east-1a = { id = "subnet-0123456789abcdef0" }
        us-east-1b = { id = "subnet-00112233445566778" }
      }
    }
  }

  override_resource {
    target          = aws_db_instance.postgres
    override_during = plan
    values = {
      master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:us-east-1:111122223333:secret:rds-managed-abcdef" }]
    }
  }

  assert {
    condition = (
      aws_db_instance.postgres.manage_master_user_password == true &&
      aws_db_instance.postgres.password_wo == null &&
      aws_db_instance.postgres.password_wo_version == null
    )
    error_message = "O RDS deve gerenciar a senha sem receber senha write-only nem sua revisão."
  }

  assert {
    condition     = output.db_master_user_secret_arn == "arn:aws:secretsmanager:us-east-1:111122223333:secret:rds-managed-abcdef"
    error_message = "A saída deve expor somente o ARN do segredo gerenciado."
  }
}

run "rede_explicita_sem_s3_e_destruivel" {
  # O apply e a limpeza deste teste usam somente o provider simulado.
  command = apply

  variables {
    expected_account_id = "111122223333"
    db_password         = "testonly000000000000000000000000"
    network_outputs = {
      vpc_id                        = "vpc-0123456789abcdef0"
      eks_cluster_security_group_id = "sg-00112233445566778"
      private_subnets = {
        us-east-1a = { id = "subnet-0123456789abcdef0" }
        us-east-1b = { id = "subnet-00112233445566778" }
      }
    }
  }

  assert {
    condition = (
      length(data.terraform_remote_state.network) == 0 &&
      aws_security_group.database.vpc_id == var.network_outputs.vpc_id &&
      aws_vpc_security_group_ingress_rule.eks_postgres.referenced_security_group_id == var.network_outputs.eks_cluster_security_group_id &&
      aws_db_subnet_group.private.subnet_ids == toset([for subnet in var.network_outputs.private_subnets : subnet.id])
    )
    error_message = "O laboratorio deve usar somente a rede fornecida, sem consultar o S3 legado."
  }

  assert {
    condition = (
      !aws_db_instance.postgres.deletion_protection &&
      aws_db_instance.postgres.skip_final_snapshot &&
      aws_db_instance.postgres.final_snapshot_identifier == null
    )
    error_message = "O RDS de laboratorio deve ser destruivel sem deixar um snapshot final."
  }
}

run "legado_preserva_rede_e_protecao" {
  command = plan

  variables {
    db_password          = "testonly000000000000000000000000"
    db_password_revision = 2
  }

  assert {
    condition = (
      length(data.terraform_remote_state.network) == 1 &&
      aws_security_group.database.vpc_id == "vpc-04354398b0920234a" &&
      aws_db_instance.postgres.deletion_protection &&
      !aws_db_instance.postgres.skip_final_snapshot &&
      aws_db_instance.postgres.final_snapshot_identifier == "as-docs-postgres-final"
    )
    error_message = "O modo legado deve manter a rede do S3, a protecao AWS e o snapshot final."
  }

  assert {
    condition = (
      aws_db_instance.postgres.manage_master_user_password != true &&
      aws_db_instance.postgres.password_wo_version == 2 &&
      output.db_master_user_secret_arn == null
    )
    error_message = "O modo padrão deve manter a revisão da senha fornecida, sem expor ARN de segredo."
  }
}

run "modo_padrao_exige_senha" {
  command = plan

  expect_failures = [var.db_password]
}

run "modo_padrao_rejeita_senha_invalida" {
  command = plan

  variables {
    db_password = "testonly00000000000000000000000!"
  }

  expect_failures = [var.db_password]
}

run "modo_gerenciado_rejeita_senha_fornecida" {
  command = plan

  variables {
    db_manage_master_user_password = true
    db_password                    = "testonly000000000000000000000000"
  }

  expect_failures = [var.db_password]
}

run "legado_rejeita_vpc_diferente" {
  command = plan

  variables {
    db_password = "testonly000000000000000000000000"
  }

  override_data {
    target          = data.terraform_remote_state.network
    override_during = plan
    values = {
      outputs = {
        vpc_id                        = "vpc-0123456789abcdef0"
        eks_cluster_security_group_id = "sg-00112233445566778"
        private_subnets = {
          us-east-1a = { id = "subnet-0123456789abcdef0" }
          us-east-1b = { id = "subnet-00112233445566778" }
        }
      }
    }
  }

  expect_failures = [aws_db_subnet_group.private]
}

run "rejeita_id_de_conta_invalido" {
  command = plan

  variables {
    expected_account_id = "11112222333"
    db_password         = "testonly000000000000000000000000"
  }

  expect_failures = [var.expected_account_id]
}

run "rede_explicita_rejeita_subnet_duplicada" {
  command = plan

  variables {
    db_password = "testonly000000000000000000000000"
    network_outputs = {
      vpc_id                        = "vpc-0123456789abcdef0"
      eks_cluster_security_group_id = "sg-00112233445566778"
      private_subnets = {
        us-east-1a = { id = "subnet-0123456789abcdef0" }
        us-east-1b = { id = "subnet-0123456789abcdef0" }
      }
    }
  }

  expect_failures = [aws_db_subnet_group.private]
}