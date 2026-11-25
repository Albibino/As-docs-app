variable "app_deploy" {
  description = "Publica backend e frontend no apply usando imagens fixadas do ECR. Sem este objeto, a raiz só prepara a infraestrutura."
  type = object({
    backend_image  = string
    frontend_image = string
  })
  default = null

  validation {
    condition = var.app_deploy == null ? true : (
      var.keycloak_enabled && var.eks_storage_enabled &&
      alltrue([for service, image in { backend = var.app_deploy.backend_image, frontend = var.app_deploy.frontend_image } :
        can(regex("^[0-9]{12}\\.dkr\\.ecr\\.us-east-1\\.amazonaws\\.com/as-docs-${service}@sha256:[a-f0-9]{64}$", image))
      ]) && (var.ai_oauth == null ? true : var.ai_oauth.backend_image == var.app_deploy.backend_image)
    )
    error_message = "app_deploy exige Keycloak, armazenamento gp3, digests dos repositórios as-docs-backend e as-docs-frontend no ECR de us-east-1 e o mesmo backend de ai_oauth, se configurado."
  }
}

locals {
  app_backend_deploy = local.effective_app_deploy == null ? null : {
    account  = local.account_id
    cluster  = module.base.eks_cluster_name
    image    = local.effective_app_deploy.backend_image
    origin   = module.edge.public_app_url
    lab_http = local.keycloak_lab_http
    ai_oauth = var.lab_full_deploy || var.ai_oauth != null
  }
  app_frontend_deploy = local.effective_app_deploy == null ? null : {
    account      = local.account_id
    image        = local.effective_app_deploy.frontend_image
    origin       = module.edge.public_app_url
    backend_url  = module.edge.backend_url
    instances    = [for host in values(module.edge.frontend_instances) : host.id]
    target_group = module.edge.integration.frontend_target_group
  }
}

resource "terraform_data" "app_backend" {
  count = var.lab_full_deploy || var.app_deploy != null ? 1 : 0

  input = local.app_backend_deploy
  triggers_replace = {
    config = local.app_backend_deploy
    bundle = { for name in [
      "deploy/apply-aws-backend.sh", "deploy/render-aws-backend.sh",
      "deploy/k8s/10-redis.yaml", "deploy/k8s/20-backend-config.yaml",
      "deploy/k8s/22-backend.yaml", "infra/terraform/storage-gp3.yaml"
    ] : name => filesha256("${path.module}/../../${name}") }
  }

  depends_on = [terraform_data.account, module.base, module.edge, aws_eks_addon.ebs_csi, terraform_data.oidc_prepare]

  lifecycle {
    precondition {
      condition     = startswith(local.effective_app_deploy.backend_image, "${local.account_id}.") && startswith(local.effective_app_deploy.frontend_image, "${local.account_id}.")
      error_message = "As imagens precisam pertencer ao ECR da conta deste laboratório."
    }
  }

  provisioner "local-exec" {
    command     = "bash apply-aws-backend.sh"
    working_dir = "${path.module}/../../deploy"
    environment = {
      EXPECTED_AWS_ACCOUNT_ID   = self.input.account
      EKS_CLUSTER               = self.input.cluster
      BACKEND_IMAGE             = self.input.image
      PUBLIC_APP_URL            = self.input.origin
      OIDC_AWS_LAB_HTTP         = tostring(self.input.lab_http)
      BACKEND_PRESERVE_AI_OAUTH = tostring(self.input.ai_oauth)
    }
  }
}

resource "terraform_data" "app_frontend" {
  count = var.lab_full_deploy || var.app_deploy != null ? 1 : 0

  input = local.app_frontend_deploy
  triggers_replace = {
    config = local.app_frontend_deploy
    script = filesha256("${path.module}/../../deploy/apply-aws-frontend.sh")
  }

  depends_on = [terraform_data.app_backend, terraform_data.ai_oauth, terraform_data.oidc_links]

  provisioner "local-exec" {
    command     = "bash apply-aws-frontend.sh"
    working_dir = "${path.module}/../../deploy"
    environment = {
      EXPECTED_AWS_ACCOUNT_ID   = self.input.account
      FRONTEND_IMAGE            = self.input.image
      PUBLIC_APP_URL            = self.input.origin
      BACKEND_URL               = self.input.backend_url
      FRONTEND_INSTANCE_IDS     = jsonencode(self.input.instances)
      FRONTEND_TARGET_GROUP_ARN = self.input.target_group
    }
  }
}
