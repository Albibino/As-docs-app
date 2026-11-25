output "eks_cluster_name" {
  description = "Nome para aws eks update-kubeconfig e consultas de status."
  value       = aws_eks_cluster.main.name
}

output "eks_cluster_endpoint" {
  description = "API do Kubernetes: acesso público restrito aos IPv4 /32 configurados."
  value       = aws_eks_cluster.main.endpoint
}

output "eks_cluster_security_group_id" {
  description = "Grupo criado pelo EKS e associado explicitamente aos nós."
  value       = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
}

output "eks_node_group_name" {
  value = aws_eks_node_group.private.node_group_name
}

output "eks_autoscaling_group_name" {
  value = try(one(one(aws_eks_node_group.private.resources).autoscaling_groups).name, null)
}

output "nat_gateways" {
  description = "NAT por zona; cada sub-rede privada usa o NAT de sua própria zona."
  value = {
    for zone, nat in aws_nat_gateway.outbound : zone => {
      id        = nat.id
      public_ip = aws_eip.nat[zone].public_ip
    }
  }
}

output "eks_core_addon_versions" {
  value = { for name, addon in aws_eks_addon.core : name => addon.addon_version }
}
