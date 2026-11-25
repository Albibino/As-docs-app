variable "ai_oauth" {
  description = "Deploy opt-in da IA e do backend por digest, após o bootstrap do laboratório. Nunca informe segredos aqui."
  type = object({
    backend_image = string
    ai_image      = string
    caddy_image   = string
    provider_mode = optional(string, "openai")
  })
  default = null

  validation {
    condition = var.ai_oauth == null ? true : (
      var.keycloak_enabled &&
      contains(["openai", "diagnostic"], var.ai_oauth.provider_mode) &&
      alltrue([for image in [var.ai_oauth.backend_image, var.ai_oauth.ai_image, var.ai_oauth.caddy_image] :
        can(regex("^[a-z0-9]+([.-][a-z0-9]+)*(:[0-9]+)?/([a-z0-9]+([._-]+[a-z0-9]+)*/)*[a-z0-9]+([._-]+[a-z0-9]+)*@sha256:[a-f0-9]{64}$", image))
      ])
    )
    error_message = "ai_oauth exige keycloak_enabled, três imagens por digest e provider_mode openai ou diagnostic."
  }
}

resource "terraform_data" "ai_oauth" {
  count = var.lab_full_deploy || var.ai_oauth != null ? 1 : 0

  input = {
    account  = local.account_id
    cluster  = module.base.eks_cluster_name
    origin   = module.edge.public_app_url
    issuer   = module.edge.keycloak_issuer
    lab_http = local.keycloak_lab_http
    images   = local.effective_ai_oauth
  }
  triggers_replace = {
    account  = local.account_id
    cluster  = module.base.eks_cluster_name
    origin   = module.edge.public_app_url
    issuer   = module.edge.keycloak_issuer
    lab_http = local.keycloak_lab_http
    images   = local.effective_ai_oauth
    backend  = one(terraform_data.app_backend[*].id)
    bundle = { for name in [
      "apply-aws-ai.sh", "probe-aws-ai.cjs", "render-aws-backend.sh", "import-aws-ai-clients.sh", "keycloak-ai-clients.cjs",
      "k8s/20-backend-config.yaml", "k8s/22-backend.yaml"
    ] : name => filesha256("${path.module}/../../deploy/${name}") }
  }

  depends_on = [terraform_data.account, module.edge, terraform_data.openai_secret, terraform_data.oidc_links]

  lifecycle {
    precondition {
      condition     = module.edge.keycloak_issuer != null
      error_message = "O OAuth da IA precisa do issuer de um Keycloak ativo neste lab."
    }
  }

  provisioner "local-exec" {
    command     = "bash apply-aws-ai.sh"
    working_dir = "${path.module}/../../deploy"
    environment = merge({
      EXPECTED_AWS_ACCOUNT_ID = self.input.account
      EKS_CLUSTER             = self.input.cluster
      PUBLIC_APP_URL          = self.input.origin
      OIDC_ISSUER             = self.input.issuer
      OIDC_AWS_LAB_HTTP       = tostring(self.input.lab_http)
      BACKEND_IMAGE           = self.input.images.backend_image
      AI_IMAGE                = self.input.images.ai_image
      CADDY_IMAGE             = self.input.images.caddy_image
      AI_PROVIDER_MODE        = self.input.images.provider_mode
    }, var.lab_full_deploy ? { TCC_DOCS_AI_PATH = local.ai_source_root } : {})
  }
}
