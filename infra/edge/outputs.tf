output "public_app_url" {
  description = "Origem para PUBLIC_APP_URL e APP_URL. Sem certificado: somente HTTP temporario. DNS do dominio e configurado pelo grupo."
  value       = local.tls_enabled ? "https://${var.public_hostname}" : "http://${aws_lb.public.dns_name}"
}

output "tls_enabled" {
  value = local.tls_enabled
}

output "public_alb" {
  value = { arn = aws_lb.public.arn, dns = aws_lb.public.dns_name, zone_id = aws_lb.public.zone_id }
}

output "backend_url" {
  description = "BACKEND_URL nas duas EC2; NLB acessivel somente na VPC a partir do SG frontend."
  value       = "http://${aws_lb.backend.dns_name}:3000"
}

output "frontend_instances" {
  description = "Hosts para deploy real via SSM. Nenhuma chave SSH ou credencial de registro e criada."
  value = {
    for zone, instance in aws_instance.frontend : zone => {
      id         = instance.id
      private_ip = instance.private_ip
    }
  }
}

output "integration" {
  value = {
    backend_node_port       = 30300
    backend_service_port    = 3000
    backend_target_group    = aws_lb_target_group.backend.arn
    frontend_target_group   = aws_lb_target_group.frontend.arn
    nlb_security_group      = aws_security_group.nlb.id
    waf_web_acl_arn         = aws_wafv2_web_acl.public.arn
    waf_log_group           = aws_cloudwatch_log_group.waf.name
    managed_node_group_name = local.base.eks_node_group_name
  }
}
