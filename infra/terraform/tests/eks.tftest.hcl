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
  # Estes casos preservam a verificacao da base da etapa 03.
  eks_storage_enabled  = false
  eks_api_access_cidrs = ["203.0.113.10/32"]
}

# Este apply usa exclusivamente o mock_provider acima, sem criar recursos AWS.
# IDs simulados ficam disponíveis para as comparações de sub-redes e rotas.
run "eks_privado_com_tres_nos_e_nat_por_zona" {
  command = apply

  assert {
    condition = (
      one(aws_eks_node_group.private.scaling_config).desired_size == 3 &&
      one(aws_eks_node_group.private.scaling_config).min_size == 3 &&
      one(aws_eks_node_group.private.scaling_config).max_size == 3 &&
      toset(aws_eks_node_group.private.subnet_ids) == toset([for subnet in aws_subnet.private : subnet.id]) &&
      tostring(one(aws_launch_template.eks_nodes.network_interfaces).associate_public_ip_address) == "false"
    )
    error_message = "O grupo precisa manter três nós nas sub-redes privadas, sem IP público."
  }

  assert {
    condition = alltrue([
      for zone in keys(local.zones) :
      aws_route.private_internet[zone].nat_gateway_id == aws_nat_gateway.outbound[zone].id &&
      aws_route.private_internet[zone].route_table_id == aws_route_table.private[zone].id &&
      aws_nat_gateway.outbound[zone].subnet_id == aws_subnet.public[zone].id
    ])
    error_message = "Cada zona deve usar seu próprio NAT na sub-rede pública correspondente."
  }

  assert {
    condition = (
      aws_eks_cluster.main.role_arn == var.eks_cluster_role_arn &&
      aws_eks_node_group.private.node_role_arn == var.eks_node_role_arn &&
      one(aws_launch_template.eks_nodes.metadata_options).http_tokens == "required" &&
      one(aws_launch_template.eks_nodes.metadata_options).http_put_response_hop_limit == 1
    )
    error_message = "Preserve as funções existentes e IMDSv2, sem acesso herdado comum dos pods ao IMDS."
  }

  assert {
    condition = (
      one(aws_eks_cluster.main.vpc_config).endpoint_private_access &&
      toset(one(aws_eks_cluster.main.vpc_config).public_access_cidrs) == var.eks_api_access_cidrs &&
      jsondecode(aws_eks_addon.core["vpc-cni"].configuration_values).enableNetworkPolicy == "true"
    )
    error_message = "Mantenha a API privada, o acesso público restrito e o suporte a NetworkPolicy."
  }
}

run "rejeita_api_aberta_ao_mundo" {
  command = plan

  variables {
    eks_api_access_cidrs = ["0.0.0.0/0"]
  }

  expect_failures = [var.eks_api_access_cidrs]
}

run "rejeita_instancia_maior_que_a_entrega" {
  command = plan

  variables {
    eks_node_instance_type = "t3.xlarge"
  }

  expect_failures = [var.eks_node_instance_type]
}
