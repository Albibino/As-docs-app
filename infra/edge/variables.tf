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
      (var.public_hostname != "" && can(regex("^arn:aws:acm:us-east-1:362749056012:certificate/[0-9a-f-]+$", var.acm_certificate_arn)))
    )
    error_message = "Configure dominio e certificado juntos, na conta e regiao corretas; ambos vazios permitem somente HTTP temporario."
  }
}
