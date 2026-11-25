variable "expected_account_id" {
  description = "Trava opcional de conta já no provider. Se omitida, o state é vinculado à conta da primeira aplicação."
  type        = string
  default     = null
  validation {
    condition     = var.expected_account_id == null || can(regex("^[0-9]{12}$", var.expected_account_id))
    error_message = "Se informado, o ID da conta deve ter 12 dígitos."
  }
}

variable "iam_mode" {
  description = "learner_lab reutiliza o IAM do Academy; managed cria IAM em uma conta com permissão. Use um state separado por modo."
  type        = string
  default     = "learner_lab"
  nullable    = false
  validation {
    condition     = contains(["learner_lab", "managed"], var.iam_mode)
    error_message = "Use learner_lab ou managed."
  }
}

variable "eks_cluster_role_arn" {
  description = "ARN opcional da LabEksClusterRole, caso a descoberta não esteja disponível."
  type        = string
  default     = null
  validation {
    condition     = var.eks_cluster_role_arn == null || (var.iam_mode == "learner_lab" && can(regex("^arn:aws:iam::[0-9]{12}:role/(.*/)?([^/]+-)?LabEksClusterRole(-[^/]+)?$", var.eks_cluster_role_arn)))
    error_message = "Informe um ARN da role LabEksClusterRole somente no modo learner_lab."
  }
}

variable "eks_node_role_arn" {
  description = "ARN opcional da LabEksNodeRole, caso a descoberta não esteja disponível."
  type        = string
  default     = null
  validation {
    condition     = var.eks_node_role_arn == null || (var.iam_mode == "learner_lab" && can(regex("^arn:aws:iam::[0-9]{12}:role/(.*/)?([^/]+-)?LabEksNodeRole(-[^/]+)?$", var.eks_node_role_arn)))
    error_message = "Informe um ARN da role LabEksNodeRole somente no modo learner_lab."
  }
}

variable "eks_api_access_cidrs" {
  description = "IPv4 /32 dos operadores do cluster."
  type        = set(string)
}

variable "eks_version" {
  description = "Versão do EKS com suporte padrão na região."
  type        = string
  default     = "1.37"
}

variable "eks_storage_enabled" {
  description = "Instala o CSI EBS: LabRole nos nós no Learner Lab; Pod Identity em managed."
  type        = bool
  default     = true
}

variable "db_engine_version" {
  description = "Versão exata do PostgreSQL 18 disponível no RDS."
  type        = string
  default     = "18.6"
}

variable "db_instance_class" {
  description = "Classe RDS disponível na região com Multi-AZ e gp2 criptografado."
  type        = string
  default     = "db.t3.micro"
}

variable "db_password" {
  description = "Senha administrativa efêmera do RDS. No Learner Lab, forneça pela variável TF_VAR_db_password."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = null
  validation {
    condition     = var.iam_mode == "learner_lab" ? can(regex("^[A-Za-z0-9]{32,128}$", var.db_password)) : var.db_password == null
    error_message = "No Learner Lab, forneça TF_VAR_db_password com 32 a 128 caracteres alfanuméricos; no modo managed, não forneça senha."
  }
}

variable "db_password_revision" {
  description = "Incremente somente ao rotacionar a senha do RDS no Learner Lab."
  type        = number
  default     = 1
}

variable "public_hostname" {
  description = "Domínio próprio, opcional para HTTPS."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ARN de certificado ACM emitido na própria conta e em us-east-1."
  type        = string
  default     = ""
}

variable "keycloak_enabled" {
  description = "Ativa o Keycloak após preparar as dependências no banco e no cluster."
  type        = bool
  default     = false
}

variable "keycloak_replicas" {
  description = "Número de réplicas do Keycloak no lab quando ativado: 1 ou 2 (padrão em nós distintos)."
  type        = number
  default     = 2

  validation {
    condition     = contains([1, 2], var.keycloak_replicas)
    error_message = "Use 1 ou 2 réplicas para o Keycloak."
  }
}

variable "keycloak_lab_http" {
  description = "Usa HTTP externo para login com contas descartáveis do Learner Lab, sem ACM."
  type        = bool
  default     = false
  validation {
    condition     = !var.keycloak_lab_http || var.iam_mode == "learner_lab"
    error_message = "O login externo sem HTTPS é exclusivo do modo learner_lab."
  }
}
