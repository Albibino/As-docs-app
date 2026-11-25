variable "keycloak_enabled" {
  description = "Provisiona o Keycloak no EKS e publica o realm pela borda HTTPS."
  type        = bool
  default     = false

  validation {
    condition     = !var.keycloak_enabled || var.keycloak_lab_http || (var.acm_certificate_arn != "" && var.public_hostname != "")
    error_message = "Keycloak exige domínio e ACM ou a opção explícita de HTTP de laboratório."
  }
}

variable "keycloak_lab_http" {
  description = "Permite login web HTTP no DNS do ALB para o laboratório descartável."
  type        = bool
  default     = false
  validation {
    condition     = !var.keycloak_lab_http || (var.acm_certificate_arn == "" && var.public_hostname == "")
    error_message = "O modo HTTP não pode coexistir com domínio ou ACM."
  }
}

variable "keycloak_ai_oauth" {
  description = "Permite que a IA consulte o JWKS privado no ingress do modo HTTP do lab."
  type        = bool
  default     = false
}

variable "keycloak_db_host" {
  description = "Endpoint do RDS existente (sem porta nem protocolo); banco e usuário exclusivos keycloak."
  type        = string
  default     = ""

  validation {
    condition     = !var.keycloak_enabled || can(regex("^as-docs-postgres\\.[a-z0-9.-]+\\.us-east-1\\.rds\\.amazonaws\\.com$", var.keycloak_db_host))
    error_message = "Informe o endpoint do RDS as-docs-postgres em us-east-1."
  }
}

locals {
  keycloak_active    = var.keycloak_enabled && (local.tls_enabled || var.keycloak_lab_http)
  keycloak_host      = var.keycloak_lab_http ? aws_lb.public.dns_name : var.public_hostname
  keycloak_origin    = "${var.keycloak_lab_http ? "http" : "https"}://${local.keycloak_host}"
  keycloak_listener  = local.tls_enabled ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
  keycloak_node_port = 30443
  keycloak_paths     = var.keycloak_lab_http ? ["/id/realms/as-docs/protocol/openid-connect/auth", "/id/realms/as-docs/login-actions/*", "/id/resources/*"] : ["/id/realms/as-docs/*", "/id/resources/*"]
  keycloak_base      = jsondecode(file("${path.module}/../../config/keycloak/as-docs-realm.json"))
  keycloak_realm = merge(local.keycloak_base, {
    displayName = "As Docs"
    sslRequired = var.keycloak_lab_http ? "none" : "all"
    clients = [for client in local.keycloak_base.clients : merge(client, client.clientId == "docs-app-web" ? {
      redirectUris = ["${local.keycloak_origin}/api/auth/oidc/callback"]
    } : {})]
  })
  keycloak_manifest_base = yamldecode(templatefile("${path.module}/keycloak.yaml.tftpl", {
    hostname        = "${local.keycloak_origin}/id"
    db_host         = var.keycloak_db_host
    node_port       = local.keycloak_node_port
    trusted_proxies = local.keycloak_active ? join(",", sort([for subnet in local.base.public_subnets : subnet.cidr])) : ""
    realm_json      = jsonencode(local.keycloak_realm)
    realm_hash      = sha256(jsonencode(local.keycloak_realm))
  }))
  keycloak_manifest = jsonencode(merge(local.keycloak_manifest_base, {
    items = concat(local.keycloak_manifest_base.items, var.keycloak_lab_http ? [jsondecode(jsonencode({
      apiVersion = "networking.k8s.io/v1"
      kind       = "NetworkPolicy"
      metadata   = { name = "keycloak-http-lab-ingress", namespace = "as-docs-identity" }
      spec = {
        podSelector = { matchLabels = { app = "as-docs-keycloak" } }
        policyTypes = ["Ingress"]
        ingress = [{
          from = concat(
            [for subnet in local.base.public_subnets : { ipBlock = { cidr = subnet.cidr } }],
            [for app in concat(["as-docs-backend"], var.keycloak_ai_oauth ? ["as-docs-ai"] : []) : {
              namespaceSelector = { matchLabels = { "kubernetes.io/metadata.name" = "as-docs" } }
              podSelector       = { matchLabels = { app = app } }
            }]
          )
          ports = [{ protocol = "TCP", port = 8443 }]
        }]
      }
    }))] : [])
  }))
}

resource "terraform_data" "keycloak" {
  count = local.keycloak_active ? 1 : 0
  input = {
    manifest = local.keycloak_manifest
    cluster  = local.base.eks_cluster_name
    account  = var.expected_account_id
  }
  triggers_replace = {
    manifest = sha256(local.keycloak_manifest)
    script   = filesha256("${path.module}/apply-keycloak.sh")
    cluster  = local.base.eks_cluster_name
    account  = var.expected_account_id
  }

  lifecycle {
    precondition {
      condition     = !local.legacy_network || local.base.eks_cluster_name == "as-docs-eks"
      error_message = "O state legado precisa apontar para o cluster as-docs-eks."
    }
  }

  # O estado guarda só o manifesto público e referências a Secrets existentes.
  provisioner "local-exec" {
    command     = "bash apply-keycloak.sh"
    working_dir = path.module
    environment = {
      KEYCLOAK_MANIFEST       = self.input.manifest
      EKS_CLUSTER             = self.input.cluster
      EXPECTED_AWS_ACCOUNT_ID = self.input.account
    }
  }
}

resource "aws_lb_target_group" "keycloak" {
  count       = local.keycloak_active ? 1 : 0
  name        = "as-docs-keycloak"
  vpc_id      = local.base.vpc_id
  target_type = "instance"
  protocol    = "HTTPS"
  port        = local.keycloak_node_port
  health_check {
    protocol            = "HTTPS"
    path                = "/id/realms/as-docs/.well-known/openid-configuration"
    matcher             = "200"
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_vpc_security_group_ingress_rule" "keycloak_from_alb" {
  count                        = local.keycloak_active ? 1 : 0
  security_group_id            = local.base.eks_cluster_security_group_id
  referenced_security_group_id = local.base.security_group_ids.alb
  ip_protocol                  = "tcp"
  from_port                    = local.keycloak_node_port
  to_port                      = local.keycloak_node_port
}

resource "aws_vpc_security_group_egress_rule" "alb_to_keycloak" {
  count                        = local.keycloak_active ? 1 : 0
  security_group_id            = local.base.security_group_ids.alb
  referenced_security_group_id = local.base.eks_cluster_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = local.keycloak_node_port
  to_port                      = local.keycloak_node_port
}

resource "aws_autoscaling_attachment" "keycloak" {
  count                  = local.keycloak_active ? 1 : 0
  autoscaling_group_name = local.backend_autoscaling_group_name
  lb_target_group_arn    = aws_lb_target_group.keycloak[0].arn
}

resource "aws_lb_listener_rule" "keycloak" {
  count        = local.keycloak_active ? 1 : 0
  listener_arn = local.keycloak_listener
  priority     = 40
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.keycloak[0].arn
  }
  condition {
    host_header { values = [local.keycloak_host] }
  }
  condition {
    path_pattern { values = local.keycloak_paths }
  }
  depends_on = [terraform_data.keycloak, aws_autoscaling_attachment.keycloak, aws_wafv2_web_acl_association.public]
}

resource "aws_lb_listener_rule" "keycloak_block" {
  count        = local.keycloak_active ? 1 : 0
  listener_arn = local.keycloak_listener
  priority     = 41
  action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "404"
    }
  }
  condition {
    path_pattern { values = ["/id", "/id/*"] }
  }
}

output "keycloak_issuer" {
  value = local.keycloak_active ? "${local.keycloak_origin}/id/realms/as-docs" : null
}

output "keycloak_target_group_arn" {
  value = local.keycloak_active ? aws_lb_target_group.keycloak[0].arn : null
}
