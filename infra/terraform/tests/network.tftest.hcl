mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = {
      names = ["us-east-1a", "us-east-1b"]
    }
  }

  mock_data "aws_eks_addon_version" {
    defaults = {
      version = "v1.0.0-eksbuild.1"
    }
  }

  mock_resource "aws_launch_template" {
    defaults = {
      id             = "lt-0123456789abcdef0"
      latest_version = 1
    }
  }
}

variables {
  eks_storage_enabled  = false
  eks_api_access_cidrs = ["203.0.113.10/32"]
}

run "rede_sem_acesso_direto_ao_frontend" {
  command = plan

  assert {
    condition     = alltrue([for subnet in aws_subnet.private : subnet.map_public_ip_on_launch == false])
    error_message = "As sub-redes privadas não podem atribuir IP público automaticamente."
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.frontend_http.cidr_ipv4 == null
    error_message = "A entrada HTTP do frontend deve referenciar o SG do ALB, sem CIDR público."
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.frontend_http.from_port == 80 && aws_vpc_security_group_ingress_rule.frontend_http.to_port == 80
    error_message = "A entrada do frontend deve ser limitada à porta HTTP do Nginx."
  }

  assert {
    condition     = aws_vpc_security_group_egress_rule.alb_frontend.cidr_ipv4 == null
    error_message = "O ALB deve encaminhar ao SG do frontend, sem destino CIDR irrestrito."
  }

  assert {
    condition     = toset([for subnet in aws_subnet.private : subnet.availability_zone]) == toset([for subnet in aws_subnet.public : subnet.availability_zone]) && length(aws_subnet.private) == 2
    error_message = "A rede precisa distribuir sub-redes públicas e privadas pelas mesmas duas zonas."
  }
}

run "regiao_fora_do_laboratorio" {
  command = plan

  variables {
    aws_region = "sa-east-1"
  }

  expect_failures = [var.aws_region]
}

run "funcao_eks_de_outra_conta" {
  command = plan

  variables {
    eks_node_role_arn = "arn:aws:iam::111111111111:role/exemplo"
  }

  expect_failures = [var.eks_node_role_arn]
}
