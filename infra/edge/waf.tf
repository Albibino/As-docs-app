locals {
  # Conteudo de documentos pode incluir HTML, caminhos e URLs. Estas regras de
  # corpo ficam em Count; URI/query/cookies mantem as acoes gerenciadas.
  # O limite de inspecao de corpo do WAF no ALB e 8 KiB, nao 200 MiB.
  document_body_count_rules = toset([
    "SizeRestrictions_BODY", "CrossSiteScripting_BODY", "GenericLFI_BODY", "GenericRFI_BODY"
  ])
}

resource "aws_wafv2_web_acl" "public" {
  name  = "as-docs-public"
  scope = "REGIONAL"
  default_action {
    allow {}
  }

  # O ALB adiciona os seus próprios X-Forwarded-* ao enviar ao destino.
  # No caminho de identidade, recuse versões fornecidas pelos clientes.
  dynamic "rule" {
    for_each = local.keycloak_active ? [1] : []
    content {
      name     = "keycloak-client-proxy-headers"
      priority = 5
      action {
        block {}
      }
      statement {
        and_statement {
          statement {
            byte_match_statement {
              positional_constraint = "STARTS_WITH"
              search_string         = "/id/"
              field_to_match {
                uri_path {}
              }
              text_transformation {
                priority = 0
                type     = "URL_DECODE"
              }
              text_transformation {
                priority = 1
                type     = "NORMALIZE_PATH"
              }
            }
          }
          statement {
            or_statement {
              dynamic "statement" {
                for_each = toset(["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-port", "x-forwarded-prefix", "x-forwarded-proto"])
                content {
                  size_constraint_statement {
                    comparison_operator = "GT"
                    size                = 0
                    field_to_match {
                      single_header { name = statement.value }
                    }
                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }
              }
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "as-docs-keycloak-proxy-headers"
        sampled_requests_enabled   = false
      }
    }
  }

  rule {
    name     = "common"
    priority = 10
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
        dynamic "rule_action_override" {
          for_each = local.document_body_count_rules
          content {
            name = rule_action_override.value
            action_to_use {
              count {}
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "as-docs-common"
      sampled_requests_enabled   = false
    }
  }

  rule {
    name     = "ip-reputation"
    priority = 20
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "as-docs-ip-reputation"
      sampled_requests_enabled   = false
    }
  }

  rule {
    name     = "rate-per-ip"
    priority = 30
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit                 = 2000
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "as-docs-rate"
      sampled_requests_enabled   = false
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "as-docs-public"
    sampled_requests_enabled   = false
  }
}

resource "aws_wafv2_web_acl_association" "public" {
  resource_arn = aws_lb.public.arn
  web_acl_arn  = aws_wafv2_web_acl.public.arn
}

resource "aws_cloudwatch_log_group" "waf" {
  name              = "aws-waf-logs-as-docs"
  retention_in_days = 7
}

resource "aws_wafv2_web_acl_logging_configuration" "public" {
  resource_arn            = aws_wafv2_web_acl.public.arn
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]

  # Códigos OIDC/state e credenciais nao devem entrar nos logs de requisicoes.
  redacted_fields {
    query_string {}
  }
  redacted_fields {
    single_header { name = "authorization" }
  }
  redacted_fields {
    single_header { name = "cookie" }
  }
  logging_filter {
    default_behavior = "DROP"
    filter {
      behavior    = "KEEP"
      requirement = "MEETS_ANY"
      condition {
        action_condition { action = "BLOCK" }
      }
    }
  }
}
