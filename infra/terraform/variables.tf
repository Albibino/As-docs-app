variable "expected_account_id" {
  description = "Conta do Learner Lab autorizada a receber os recursos."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.expected_account_id))
    error_message = "Informe o ID da conta AWS com 12 dígitos."
  }
}

variable "aws_region" {
  description = "Região permitida pelo Readme do laboratório."
  type        = string
  default     = "us-east-1"

  validation {
    condition     = contains(["us-east-1", "us-west-2"], var.aws_region)
    error_message = "Este laboratório permite us-east-1 ou us-west-2."
  }
}

variable "project_name" {
  description = "Prefixo usado nos nomes dos recursos desta infraestrutura."
  type        = string
  default     = "as-docs"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,23}$", var.project_name))
    error_message = "Use entre 2 e 24 caracteres: letras minúsculas, números e hífens; comece com uma letra."
  }
}

variable "vpc_cidr" {
  description = "Bloco IPv4 /16. O padrão corresponde aos CIDRs dos manifests Kubernetes recebidos."
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.vpc_cidr)) && can(regex("/16$", var.vpc_cidr))
    error_message = "Informe um bloco IPv4 /16 válido, como 10.0.0.0/16."
  }
}

variable "eks_cluster_role_arn" {
  description = "Função existente do cluster, reservada para a próxima etapa; não é criada por este código."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:iam::${var.expected_account_id}:role/.+$", var.eks_cluster_role_arn))
    error_message = "A função do cluster precisa pertencer à conta configurada em expected_account_id."
  }
}

variable "eks_node_role_arn" {
  description = "Função existente dos nós, reservada para a próxima etapa; não é criada por este código."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:iam::${var.expected_account_id}:role/.+$", var.eks_node_role_arn))
    error_message = "A função dos nós precisa pertencer à conta configurada em expected_account_id."
  }

  validation {
    condition     = var.eks_node_role_arn != var.eks_cluster_role_arn
    error_message = "Use as funções distintas disponibilizadas para o cluster e para os nós."
  }
}
