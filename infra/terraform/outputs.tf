output "vpc_id" {
  description = "VPC criada por esta etapa."
  value       = aws_vpc.main.id
}

output "public_subnets" {
  description = "Sub-redes públicas, organizadas por zona de disponibilidade."
  value = {
    for zone, subnet in aws_subnet.public : zone => {
      id   = subnet.id
      cidr = subnet.cidr_block
    }
  }
}

output "private_subnets" {
  description = "Sub-redes privadas; saída NAT será adicionada junto ao EKS."
  value = {
    for zone, subnet in aws_subnet.private : zone => {
      id             = subnet.id
      cidr           = subnet.cidr_block
      route_table_id = aws_route_table.private[zone].id
    }
  }
}

output "security_group_ids" {
  value = {
    alb      = aws_security_group.alb.id
    frontend = aws_security_group.frontend.id
  }
}

output "existing_eks_role_arns" {
  description = "Parâmetros existentes reservados para a etapa EKS; não representam recursos criados."
  value = {
    cluster = var.eks_cluster_role_arn
    nodes   = var.eks_node_role_arn
  }
}
