mock_provider "aws" {
  override_during = plan
  mock_data "aws_iam_instance_profile" {
    defaults = { role_arn = "arn:aws:iam::967931808920:role/LabRole" }
  }
  mock_data "aws_eks_node_group" {
    defaults = { resources = [{ autoscaling_groups = [{ name = "eks-as-docs-fixture" }] }] }
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
}

override_data {
  target          = data.terraform_remote_state.network
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
        us-east-1a = { id = "subnet-02ad1d11473fac085" }
        us-east-1b = { id = "subnet-063bcd96ac81fc44d" }
      }
      security_group_ids = { alb = "sg-09949bead0e930a24", frontend = "sg-0a5118ad08038a7e8" }
    }
  }
}

run "keycloak_desativado_na_borda_legada" {
  command = plan
  assert {
    condition     = output.keycloak_issuer == null && length(aws_lb_target_group.keycloak) == 0 && length(terraform_data.keycloak) == 0
    error_message = "A borda existente não deve começar a provisionar identidade sem opt-in."
  }
}

run "keycloak_nao_aceita_borda_http" {
  command = plan
  variables {
    keycloak_enabled = true
    keycloak_db_host = "as-docs-postgres.fixture.us-east-1.rds.amazonaws.com"
  }
  expect_failures = [var.keycloak_enabled]
}

run "keycloak_publica_somente_realm_e_recursos_em_https" {
  command = plan
  variables {
    keycloak_enabled    = true
    keycloak_db_host    = "as-docs-postgres.fixture.us-east-1.rds.amazonaws.com"
    public_hostname     = "docs.grupo.test"
    acm_certificate_arn = "arn:aws:acm:us-east-1:967931808920:certificate/01234567-89ab-cdef-0123-456789abcdef"
  }
  assert {
    condition = (
      output.keycloak_issuer == "https://docs.grupo.test/id/realms/as-docs" &&
      aws_lb_target_group.keycloak[0].protocol == "HTTPS" && aws_lb_target_group.keycloak[0].port == 30443 &&
      aws_lb_listener_rule.keycloak[0].listener_arn == aws_lb_listener.https[0].arn &&
      one([for c in aws_lb_listener_rule.keycloak[0].condition : one(c.path_pattern) if length(c.path_pattern) > 0]).values == toset(["/id/realms/as-docs/*", "/id/resources/*"]) &&
      one(aws_lb_listener_rule.keycloak_block[0].action).type == "fixed-response" &&
      contains([for r in aws_wafv2_web_acl.public.rule : r.name], "keycloak-client-proxy-headers") &&
      aws_vpc_security_group_ingress_rule.keycloak_from_alb[0].referenced_security_group_id == local.base.security_group_ids.alb &&
      aws_autoscaling_attachment.keycloak[0].autoscaling_group_name == "eks-as-docs-fixture"
    )
    error_message = "A rota HTTPS não pode expor admin, master ou porta de gestão."
  }
  assert {
    condition = (
      jsondecode(local.keycloak_manifest).items[2].data["as-docs-realm.json"] != "" &&
      local.keycloak_realm.sslRequired == "all" && !local.keycloak_realm.registrationAllowed &&
      one([for c in local.keycloak_realm.clients : c if c.clientId == "docs-app-web"]).redirectUris[0] == "https://docs.grupo.test/api/auth/oidc/callback" &&
      !strcontains(local.keycloak_manifest, "localhost:8080")
    )
    error_message = "O realm deve usar o callback HTTPS exato, cadastro fechado e sem configuração do laboratório local."
  }
}
