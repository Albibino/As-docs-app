locals {
  eks_cluster_name = "${var.project_name}-eks"
}

resource "aws_cloudwatch_log_group" "eks" {
  name              = "/aws/eks/${local.eks_cluster_name}/cluster"
  retention_in_days = 7

  tags = {
    Name  = "${var.project_name}-eks-logs"
    Stage = "03-eks"
  }
}

resource "aws_eks_cluster" "main" {
  name                          = local.eks_cluster_name
  role_arn                      = var.eks_cluster_role_arn
  version                       = var.eks_version
  bootstrap_self_managed_addons = true
  enabled_cluster_log_types     = ["api", "audit", "authenticator"]

  access_config {
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = true
  }

  vpc_config {
    subnet_ids              = [for zone in sort(keys(local.zones)) : aws_subnet.private[zone].id]
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = var.eks_api_access_cidrs
  }

  kubernetes_network_config {
    ip_family         = "ipv4"
    service_ipv4_cidr = "172.20.0.0/16"
  }

  upgrade_policy {
    support_type = "STANDARD"
  }

  tags = {
    Name  = local.eks_cluster_name
    Stage = "03-eks"
  }

  depends_on = [aws_cloudwatch_log_group.eks]
}

resource "aws_launch_template" "eks_nodes" {
  name_prefix = "${var.project_name}-eks-nodes-"
  description = "Nos privados EKS; IMDSv2 e disco raiz criptografado"

  # EKS fornece a AMI e a inicialização AL2023. Não definir image_id,
  # iam_instance_profile ou subnet_id neste template de node group gerenciado.
  network_interfaces {
    device_index                = 0
    associate_public_ip_address = false
    delete_on_termination       = true
    security_groups             = [aws_eks_cluster.main.vpc_config[0].cluster_security_group_id]
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
    # O controller CSI gerenciado nao oferece hostNetwork em sua configuracao.
    # No Academy, sem IRSA/Pod Identity autorizados, usa a role EC2 existente.
    # Etapa 05 exige instalar a regra de egress contra IMDS no namespace do app.
    http_put_response_hop_limit = var.eks_storage_enabled ? 2 : 1
    instance_metadata_tags      = "disabled"
  }

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_type           = "gp3"
      volume_size           = 20
      encrypted             = true
      delete_on_termination = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "${var.project_name}-eks-private"
      Project     = var.project_name
      Environment = "academico"
      ManagedBy   = "Terraform"
      Stage       = "03-eks"
    }
  }

  tag_specifications {
    resource_type = "volume"
    tags = {
      Project   = var.project_name
      ManagedBy = "Terraform"
      Stage     = "03-eks"
    }
  }

  tags = {
    Name  = "${var.project_name}-eks-nodes"
    Stage = "03-eks"
  }
}

resource "aws_eks_node_group" "private" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = var.eks_storage_enabled ? "${var.project_name}-private-storage" : "${var.project_name}-private"
  node_role_arn   = var.eks_storage_enabled ? data.aws_iam_role.storage_nodes[0].arn : var.eks_node_role_arn
  subnet_ids      = [for zone in sort(keys(local.zones)) : aws_subnet.private[zone].id]
  version         = var.eks_version
  ami_type        = "AL2023_x86_64_STANDARD"
  capacity_type   = "ON_DEMAND"
  instance_types  = [var.eks_node_instance_type]

  launch_template {
    id      = aws_launch_template.eks_nodes.id
    version = tostring(aws_launch_template.eks_nodes.latest_version)
  }

  scaling_config {
    desired_size = 3
    min_size     = 3
    max_size     = 3
  }

  update_config {
    max_unavailable = 1
    update_strategy = "MINIMAL"
  }

  labels = {
    project = var.project_name
    tier    = "private"
  }

  # Um novo nome permite criar os tres substitutos antes de retirar os antigos.
  # Essa transicao foi preparada apos confirmar ausencia de apps e PVCs.
  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name  = "${var.project_name}-eks-private"
    Stage = "03-eks"
  }

  # O CNI inicial é instalado pelo EKS e usa a política já presente na role
  # dos nós. Os add-ons são convertidos para gerenciados depois dos nós ativos.
  depends_on = [aws_route.private_internet]
}
