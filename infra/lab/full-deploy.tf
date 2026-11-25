variable "lab_full_deploy" {
  description = "Em uma conta Learner Lab nova, publica imagens e prepara o app completo no mesmo apply. Não use em um state com deploy manual existente."
  type        = bool
  default     = false

  validation {
    condition = !var.lab_full_deploy || (
      var.iam_mode == "learner_lab" && var.eks_storage_enabled && var.app_deploy == null && var.ai_oauth == null &&
      var.public_hostname == "" && var.acm_certificate_arn == "" && var.openai_secret_revision != null
    )
    error_message = "lab_full_deploy exige Learner Lab descartável, CSI, chave OpenAI configurada e nenhum app_deploy ou ai_oauth manual, domínio ou ACM."
  }
}

variable "lab_ai_checkout" {
  description = "Caminho do checkout compatível de As-docs-ai, absoluto ou relativo a infra/lab."
  type        = string
  default     = "../../../As-docs-ai"
}

locals {
  app_source_root = abspath("${path.module}/../..")
  ai_source_root  = startswith(var.lab_ai_checkout, "/") ? abspath(var.lab_ai_checkout) : abspath("${path.module}/${var.lab_ai_checkout}")
  lab_images      = var.lab_full_deploy ? toset(["frontend", "backend", "ai"]) : toset([])
  # Os manifestos vêm do mesmo seletor Git que monta os contextos Docker.
  build_roots = var.lab_full_deploy ? { app = local.app_source_root, ai = local.ai_source_root } : {}
  build_fingerprints = { for kind, root in local.build_roots : kind => sha256(join("", [
    for name in sort(jsondecode(file("${root}/deploy/aws-lab-build-inputs.json"))) :
    "${sha256(name)}:${filesha256("${root}/${name}")}\n"
  ])) }
  image_tags = { for service in local.lab_images : service => "lab-${substr(sha256(jsonencode({
    service   = service
    publisher = filesha256("${local.app_source_root}/deploy/publish-aws-lab-images.sh")
    sources   = local.build_fingerprints[service == "ai" ? "ai" : "app"]
  })), 0, 24)}" }
  published = { for service, image in data.aws_ecr_image.lab : service => "${aws_ecr_repository.lab[service].repository_url}@${image.image_digest}" }
  effective_app_deploy = var.lab_full_deploy ? {
    backend_image  = local.published.backend
    frontend_image = local.published.frontend
  } : var.app_deploy
  effective_ai_oauth = var.lab_full_deploy ? {
    backend_image = local.published.backend
    ai_image      = local.published.ai
    caddy_image   = "docker.io/library/caddy@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d"
    provider_mode = "openai"
  } : var.ai_oauth
  keycloak_enabled  = var.lab_full_deploy || var.keycloak_enabled
  keycloak_lab_http = var.lab_full_deploy || var.keycloak_lab_http
}

resource "aws_ecr_repository" "lab" {
  for_each             = local.lab_images
  name                 = "as-docs-${each.key}"
  image_tag_mutability = "IMMUTABLE"
  # Só repositórios criados e gerenciados pelo modo integral deste state.
  force_delete = true
  depends_on   = [terraform_data.account]
}

resource "terraform_data" "publish_images" {
  count = var.lab_full_deploy ? 1 : 0
  input = {
    account = data.aws_caller_identity.current.account_id
    repos   = { for service, repo in aws_ecr_repository.lab : service => repo.repository_url }
    tags    = local.image_tags
    sources = local.build_fingerprints
  }
  triggers_replace = {
    repos = { for service, repo in aws_ecr_repository.lab : service => repo.arn }
    tags  = local.image_tags
  }
  lifecycle {
    precondition {
      condition     = fileexists("${local.ai_source_root}/Dockerfile") && fileexists("${local.ai_source_root}/deploy/render-aws-oauth.sh")
      error_message = "Clone a revisão compatível de As-docs-ai ao lado do app ou ajuste lab_ai_checkout."
    }
  }

  provisioner "local-exec" {
    command     = "bash publish-aws-lab-images.sh"
    working_dir = "${local.app_source_root}/deploy"
    environment = {
      EXPECTED_AWS_ACCOUNT_ID = self.input.account
      TCC_DOCS_AI_PATH        = local.ai_source_root
      FRONTEND_REPO           = self.input.repos.frontend
      BACKEND_REPO            = self.input.repos.backend
      AI_REPO                 = self.input.repos.ai
      FRONTEND_TAG            = self.input.tags.frontend
      BACKEND_TAG             = self.input.tags.backend
      AI_TAG                  = self.input.tags.ai
      APP_BUILD_FINGERPRINT   = self.input.sources.app
      AI_BUILD_FINGERPRINT    = self.input.sources.ai
    }
  }
}

data "aws_ecr_image" "lab" {
  for_each        = local.lab_images
  repository_name = aws_ecr_repository.lab[each.key].name
  image_tag       = local.image_tags[each.key]
  depends_on      = [terraform_data.publish_images]
}

resource "terraform_data" "bootstrap_db" {
  count = var.lab_full_deploy ? 1 : 0
  input = {
    account = local.account_id
    cluster = module.base.eks_cluster_name
    host    = module.database.database_connection.host
  }
  triggers_replace = {
    cluster = module.base.eks_cluster_name
    host    = module.database.database_connection.host
    script  = filesha256("${local.app_source_root}/deploy/bootstrap-aws-lab-db.py")
  }
  depends_on = [module.base, module.database, aws_eks_addon.ebs_csi]
  provisioner "local-exec" {
    command     = "python3 bootstrap-aws-lab-db.py"
    working_dir = "${local.app_source_root}/deploy"
    environment = {
      EXPECTED_AWS_ACCOUNT_ID = self.input.account
      EKS_CLUSTER             = self.input.cluster
      DB_HOST                 = self.input.host
      DB_ADMIN_PASSWORD       = var.db_password
    }
  }
}

locals {
  oidc_bootstrap = var.lab_full_deploy ? {
    EXPECTED_AWS_ACCOUNT_ID = local.account_id
    EKS_CLUSTER             = module.base.eks_cluster_name
    PUBLIC_APP_URL          = module.edge.public_app_url
    OIDC_ISSUER             = module.edge.keycloak_issuer
    BACKEND_IMAGE           = local.effective_app_deploy.backend_image
  } : null
  oidc_bootstrap_hash = var.lab_full_deploy ? { for file in fileset("${local.app_source_root}/deploy", "{bootstrap-aws-lab-oidc.sh,lab-oidc*}") : file => filesha256("${local.app_source_root}/deploy/${file}") } : {}
}

resource "terraform_data" "oidc_prepare" {
  count = var.lab_full_deploy ? 1 : 0
  triggers_replace = {
    config  = local.oidc_bootstrap
    scripts = local.oidc_bootstrap_hash
  }
  depends_on = [module.edge]
  provisioner "local-exec" {
    command     = "bash bootstrap-aws-lab-oidc.sh prepare"
    working_dir = "${local.app_source_root}/deploy"
    environment = local.oidc_bootstrap
  }
}

resource "terraform_data" "oidc_links" {
  count = var.lab_full_deploy ? 1 : 0
  triggers_replace = {
    backend = one(terraform_data.app_backend[*].id)
    prepare = one(terraform_data.oidc_prepare[*].id)
  }
  provisioner "local-exec" {
    command     = "bash bootstrap-aws-lab-oidc.sh link"
    working_dir = "${local.app_source_root}/deploy"
    environment = local.oidc_bootstrap
  }
}
