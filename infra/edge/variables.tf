variable "expected_account_id" {
  description = "ID da conta AWS da sessão; a conta legada é o padrão para uso direto."
  type        = string
  default     = "967931808920"
  nullable    = false

  validation {
    condition     = can(regex("^[0-9]{12}$", var.expected_account_id))
    error_message = "Informe um ID de conta AWS com 12 dígitos."
  }

  validation {
    condition     = var.expected_account_id == "967931808920" || var.network_outputs != null
    error_message = "Para outra conta, forneça network_outputs; o state S3 legado não é portátil."
  }
}

variable "network_outputs" {
  description = "Outputs da rede e do EKS da mesma conta. Nulo usa o state S3 legado."
  type = object({
    vpc_id                        = string
    public_subnets                = map(object({ id = string, cidr = string }))
    private_subnets               = map(object({ id = string }))
    security_group_ids            = object({ alb = string, frontend = string })
    eks_cluster_name              = string
    eks_cluster_security_group_id = string
    eks_node_group_name           = string
    eks_autoscaling_group_name    = string
  })
  default = null
}

variable "frontend_instance_profile_name" {
  description = "Nome do instance profile existente na conta selecionada, com acesso ao SSM."
  type        = string
  default     = "LabInstanceProfile"
  nullable    = false

  validation {
    condition     = can(regex("^[A-Za-z0-9_+=,.@-]{1,128}$", var.frontend_instance_profile_name))
    error_message = "Informe o nome válido de um instance profile, não um ARN."
  }
}

variable "public_hostname" {
  description = "Dominio confirmado pelo grupo, correspondente ao certificado. Vazio: HTTP temporario pelo DNS do ALB."
  type        = string
  default     = ""

  validation {
    condition = var.public_hostname == "" || (
      can(regex("^[A-Za-z0-9][A-Za-z0-9.-]+\\.[A-Za-z]{2,}$", var.public_hostname)) &&
      !endswith(lower(var.public_hostname), "exemplo.com") &&
      !endswith(lower(var.public_hostname), "amazonaws.com")
    )
    error_message = "Informe um dominio real confirmado pelo grupo, sem protocolo/caminho; nao use o exemplo ou o DNS AWS como dominio de certificado."
  }
}

variable "acm_certificate_arn" {
  description = "Certificado ACM ISSUED em us-east-1 desta conta, cobrindo public_hostname; nao cria nem compra dominio."
  type        = string
  default     = ""

  validation {
    condition = (
      (var.acm_certificate_arn == "" && var.public_hostname == "") ||
      (var.public_hostname != "" && can(regex("^arn:aws:acm:us-east-1:${var.expected_account_id}:certificate/[0-9a-f-]+$", var.acm_certificate_arn)))
    )
    error_message = "Configure dominio e certificado juntos, na conta e regiao corretas; ambos vazios permitem somente HTTP temporario."
  }
}
