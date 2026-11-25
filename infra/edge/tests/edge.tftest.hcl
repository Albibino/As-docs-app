mock_provider "aws" {
  override_during = plan
  mock_data "aws_iam_instance_profile" {
    defaults = { role_arn = "arn:aws:iam::967931808920:role/LabRole" }
  }
  mock_data "aws_ssm_parameter" {
    defaults = { value = "ami-0123456789abcdef0" }
  }
  mock_data "aws_eks_node_group" {
    defaults = {
      resources = [{ autoscaling_groups = [{ name = "eks-as-docs-fixture" }] }]
    }
  }
  mock_resource "aws_instance" {
    defaults = { id = "i-0123456789abcdef0" }
  }
  mock_resource "aws_security_group" {
    defaults = { id = "sg-0123456789abcdef0" }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:967931808920:loadbalancer/app/as-docs-fixture/0123456789abcdef" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:967931808920:targetgroup/as-docs-fixture/0123456789abcdef" }
  }
  mock_resource "aws_lb_listener" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:967931808920:listener/app/as-docs-fixture/0123456789abcdef/0123456789abcdef" }
  }
  mock_resource "aws_wafv2_web_acl" {
    defaults = { arn = "arn:aws:wafv2:us-east-1:967931808920:regional/webacl/as-docs-fixture/01234567-89ab-cdef-0123-456789abcdef" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:967931808920:log-group:aws-waf-logs-as-docs" }
  }
}

# Evita ler S3 mesmo durante os testes simulados do provider AWS.
override_data {
  target          = data.terraform_remote_state.network[0]
  override_during = plan
  values = {
    outputs = {
      vpc_id                        = "vpc-04354398b0920234a"
      eks_cluster_name              = "as-docs-eks"
      eks_node_group_name           = "as-docs-private-storage"
      eks_cluster_security_group_id = "sg-0a3d3f64bea7b6b6e"
      public_subnets = {
        us-east-1a = { id = "subnet-07934ea197dafcb9b", cidr = "10.0.0.0/24" }
        us-east-1b = { id = "subnet-007a707f3b0232699", cidr = "10.0.1.0/24" }
      }
      private_subnets = {
        us-east-1a = { id = "subnet-02ad1d11473fac085", cidr = "10.0.10.0/24" }
        us-east-1b = { id = "subnet-063bcd96ac81fc44d", cidr = "10.0.11.0/24" }
      }
      security_group_ids = { alb = "sg-09949bead0e930a24", frontend = "sg-0a5118ad08038a7e8" }
    }
  }
}

# Planos simulados: mocks conhecidos no plan, sem recursos AWS reais.
run "duas_ec2_e_encaminhamento_privado_sem_controller" {
  command = plan

  assert {
    condition = (
      length(data.terraform_remote_state.network) == 1 &&
      aws_lb_target_group.frontend.vpc_id == "vpc-04354398b0920234a" &&
      aws_instance.frontend["us-east-1a"].iam_instance_profile == "LabInstanceProfile"
    )
    error_message = "Sem inputs portáteis, a borda deve preservar o state e o perfil legados."
  }

  assert {
    condition = length(aws_instance.frontend) == 2 && alltrue([
      for instance in aws_instance.frontend :
      one(instance.metadata_options).http_tokens == "required" &&
      one(instance.metadata_options).http_put_response_hop_limit == 1 &&
      one(instance.root_block_device).encrypted &&
      instance.associate_public_ip_address &&
      instance.instance_type == "t3.micro"
    ])
    error_message = "Dois hosts frontend devem usar discos criptografados e IMDSv2 hop limit 1."
  }

  assert {
    condition = (
      !aws_lb.public.internal && aws_lb.backend.internal &&
      aws_lb.backend.enable_cross_zone_load_balancing &&
      aws_lb_listener.backend.port == 3000 && aws_lb_target_group.backend.port == 30300 &&
      aws_vpc_security_group_ingress_rule.frontend_nlb.referenced_security_group_id == local.base.security_group_ids.frontend &&
      aws_vpc_security_group_ingress_rule.nodes_from_nlb.referenced_security_group_id == aws_security_group.nlb.id &&
      aws_autoscaling_attachment.backend.autoscaling_group_name == "eks-as-docs-fixture"
    )
    error_message = "O NLB deve ser privado, restringir SGs e registrar nos via ASG/NodePort."
  }

  assert {
    condition = (
      aws_wafv2_web_acl_association.public.resource_arn == aws_lb.public.arn &&
      aws_wafv2_web_acl_association.public.web_acl_arn == aws_wafv2_web_acl.public.arn &&
      !one(aws_wafv2_web_acl.public.visibility_config).sampled_requests_enabled &&
      length(aws_wafv2_web_acl_logging_configuration.public.redacted_fields) == 3 &&
      !output.tls_enabled && length(aws_lb_listener.https) == 0
    )
    error_message = "Associar WAF, ocultar campos de credenciais e nao anunciar HTTPS sem certificado."
  }
}

run "https_com_certificado_redireciona_http_e_bloqueia_mcp" {
  command = plan
  variables {
    public_hostname     = "docs.grupo.test"
    acm_certificate_arn = "arn:aws:acm:us-east-1:967931808920:certificate/01234567-89ab-cdef-0123-456789abcdef"
  }
  assert {
    condition = (
      output.tls_enabled && length(aws_lb_listener.https) == 1 &&
      one(aws_lb_listener.http.default_action).type == "redirect" &&
      one(one(aws_lb_listener.http.default_action).redirect).host == var.public_hostname &&
      length(aws_lb_listener_rule.block_mcp) == 2 &&
      output.public_app_url == "https://docs.grupo.test"
    )
    error_message = "TLS deve configurar o certificado, redirecionar HTTP e manter o bloqueio do MCP nas duas portas."
  }
}

run "rejeita_certificado_de_outra_conta" {
  command = plan
  variables {
    public_hostname     = "docs.grupo.test"
    acm_certificate_arn = "arn:aws:acm:us-east-1:111111111111:certificate/01234567-89ab-cdef-0123-456789abcdef"
  }
  expect_failures = [var.acm_certificate_arn]
}

run "rede_portatil_na_segunda_conta_com_https_e_keycloak" {
  command = plan
  variables {
    expected_account_id            = "222222222222"
    frontend_instance_profile_name = "PortableProfile"
    public_hostname                = "docs.laboratorio.test"
    acm_certificate_arn            = "arn:aws:acm:us-east-1:222222222222:certificate/01234567-89ab-cdef-0123-456789abcdef"
    keycloak_enabled               = true
    keycloak_db_host               = "as-docs-postgres.fixture.us-east-1.rds.amazonaws.com"
    network_outputs = {
      vpc_id                        = "vpc-02222222222222222"
      eks_cluster_name              = "portatil-eks"
      eks_node_group_name           = "portatil-nos"
      eks_autoscaling_group_name    = "portatil-asg"
      eks_cluster_security_group_id = "sg-02222222222222222"
      public_subnets = {
        us-east-1a = { id = "subnet-01111111111111111", cidr = "10.1.0.0/24" }
        us-east-1b = { id = "subnet-02222222222222222", cidr = "10.1.1.0/24" }
      }
      private_subnets = {
        us-east-1a = { id = "subnet-03333333333333333" }
        us-east-1b = { id = "subnet-04444444444444444" }
      }
      security_group_ids = { alb = "sg-03333333333333333", frontend = "sg-04444444444444444" }
    }
  }

  override_data {
    target = data.aws_iam_instance_profile.frontend
    values = { role_arn = "arn:aws:iam::222222222222:role/lab/PortableRole" }
  }

  assert {
    condition = (
      length(data.terraform_remote_state.network) == 0 &&
      length(data.aws_eks_node_group.backend) == 0 &&
      aws_autoscaling_attachment.backend.autoscaling_group_name == "portatil-asg" &&
      aws_autoscaling_attachment.keycloak[0].autoscaling_group_name == "portatil-asg" &&
      aws_lb_target_group.frontend.vpc_id == var.network_outputs.vpc_id &&
      aws_instance.frontend["us-east-1a"].subnet_id == var.network_outputs.public_subnets["us-east-1a"].id &&
      aws_instance.frontend["us-east-1a"].iam_instance_profile == var.frontend_instance_profile_name &&
      aws_lb.backend.subnets == toset([for subnet in var.network_outputs.private_subnets : subnet.id]) &&
      output.integration.managed_node_group_name == var.network_outputs.eks_node_group_name
    )
    error_message = "A borda portátil deve usar os outputs fornecidos e o perfil selecionado, sem leitura do state legado."
  }

  assert {
    condition = (
      aws_lb_listener.https[0].certificate_arn == var.acm_certificate_arn &&
      terraform_data.keycloak[0].input.account == var.expected_account_id &&
      terraform_data.keycloak[0].input.cluster == var.network_outputs.eks_cluster_name &&
      strcontains(terraform_data.keycloak[0].input.manifest, "10.1.0.0/24,10.1.1.0/24")
    )
    error_message = "TLS e Keycloak devem usar o certificado, a conta, o cluster e as sub-redes do laboratório."
  }
}
