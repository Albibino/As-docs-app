variable "openai_secret_revision" {
  description = "Ativa a entrega da chave OpenAI no EKS. Comece em 1 e incremente para atualizar o Secret."
  type        = number
  default     = null

  validation {
    condition     = var.openai_secret_revision == null ? true : var.openai_secret_revision >= 1 && floor(var.openai_secret_revision) == var.openai_secret_revision
    error_message = "openai_secret_revision precisa ser um inteiro positivo."
  }
}

variable "openai_api_key" {
  description = "Chave OpenAI do projeto, fornecida somente pelo arquivo privado openai.auto.tfvars."
  type        = string
  default     = ""
  nullable    = false
  sensitive   = true
  ephemeral   = true

  validation {
    condition     = var.openai_secret_revision == null ? var.openai_api_key == "" : can(regex("^[^[:space:]]+$", var.openai_api_key))
    error_message = "Configure openai_api_key sem espaços e openai_secret_revision juntos no arquivo privado openai.auto.tfvars, ou omita ambos."
  }
}

resource "terraform_data" "openai_secret" {
  count = var.openai_secret_revision == null ? 0 : 1

  input = {
    account = local.account_id
    cluster = module.base.eks_cluster_name
  }
  triggers_replace = {
    account  = local.account_id
    cluster  = module.base.eks_cluster_name
    revision = var.openai_secret_revision
    script   = filesha256("${path.module}/../../deploy/apply-aws-openai-secret.sh")
  }

  depends_on = [terraform_data.account, module.base]

  provisioner "local-exec" {
    command     = "bash apply-aws-openai-secret.sh"
    working_dir = "${path.module}/../../deploy"
    environment = {
      EXPECTED_AWS_ACCOUNT_ID = self.input.account
      EKS_CLUSTER             = self.input.cluster
      OPENAI_API_KEY          = var.openai_api_key
    }
  }
}
