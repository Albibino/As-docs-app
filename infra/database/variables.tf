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

variable "db_password" {
  description = "Senha local, sensível e efêmera, entregue ao RDS pelo argumento write-only."
  type        = string
  sensitive   = true
  ephemeral   = true
  validation {
    condition     = can(regex("^[A-Za-z0-9]{32,128}$", var.db_password))
    error_message = "A senha gerada deve ter entre 32 e 128 caracteres alfanuméricos."
  }
}

variable "db_password_revision" {
  description = "Incremente somente quando realizar uma rotação intencional da senha."
  type        = number
  default     = 1
  validation {
    condition     = var.db_password_revision >= 1 && floor(var.db_password_revision) == var.db_password_revision
    error_message = "A revisão da senha deve ser um inteiro positivo."
  }
}
