variable "expected_account_id" {
  description = "ID da conta AWS em que o banco pode ser gerenciado."
  type        = string
  default     = "967931808920"
  nullable    = false

  validation {
    condition     = can(regex("^[0-9]{12}$", var.expected_account_id))
    error_message = "Informe um ID de conta AWS com 12 dígitos."
  }
}

variable "network_outputs" {
  description = "Rede da mesma implantação, com sub-redes privadas por zona. Sem este objeto, consulta o state S3 legado."
  type = object({
    vpc_id                        = string
    eks_cluster_security_group_id = string
    private_subnets               = map(object({ id = string }))
  })
  default = null
}

variable "db_engine_version" {
  description = "Versão exata PostgreSQL 18 confirmada pela API RDS no preparar-banco.py."
  type        = string
  validation {
    condition     = can(regex("^18\\.[0-9]+(\\.[0-9]+)?$", var.db_engine_version))
    error_message = "Informe uma versão exata PostgreSQL 18 disponível nesta região."
  }
}

variable "db_instance_class" {
  description = "Classe pequena confirmada como disponível com gp2 criptografado e Multi-AZ."
  type        = string
  validation {
    condition = contains([
      "db.t3.micro", "db.t4g.micro", "db.t3.small", "db.t4g.small",
      "db.t3.medium", "db.t4g.medium"
    ], var.db_instance_class)
    error_message = "Use uma das classes micro, small ou medium verificadas pelo helper."
  }
}

variable "db_manage_master_user_password" {
  description = "Delega ao RDS o gerenciamento da senha mestra no AWS Secrets Manager."
  type        = bool
  default     = false
  nullable    = false
}

variable "db_password" {
  description = "Senha sensível e efêmera, enviada por argumento write-only. Omitir quando o RDS gerenciar a senha."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = null
  nullable    = true

  validation {
    condition     = var.db_manage_master_user_password ? var.db_password == null : var.db_password != null
    error_message = "Informe db_password no modo padrão e omita db_password quando db_manage_master_user_password for true."
  }

  validation {
    condition     = var.db_password == null || can(regex("^[A-Za-z0-9]{32,128}$", var.db_password))
    error_message = "A senha gerada deve ter entre 32 e 128 caracteres alfanuméricos."
  }
}

variable "db_password_revision" {
  description = "No modo não gerenciado, incremente somente para uma rotação intencional da senha."
  type        = number
  default     = 1
  validation {
    condition     = var.db_password_revision >= 1 && floor(var.db_password_revision) == var.db_password_revision
    error_message = "A revisão da senha deve ser um inteiro positivo."
  }
}
