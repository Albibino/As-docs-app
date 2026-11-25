mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111122223333" }
  }
  mock_data "aws_eks_addon_version" {
    defaults = { version = "v1.0.0-eksbuild.1" }
  }
}

variables {
  eks_api_access_cidrs = ["192.0.2.5/32"]
}

override_module {
  target = module.base
  outputs = {
    vpc_id                        = "vpc-0123456789abcdef0"
    public_subnets                = { us-east-1a = { id = "subnet-00000000000000001", cidr = "10.0.0.0/24" }, us-east-1b = { id = "subnet-00000000000000002", cidr = "10.0.1.0/24" } }
    private_subnets               = { us-east-1a = { id = "subnet-00000000000000003" }, us-east-1b = { id = "subnet-00000000000000004" } }
    security_group_ids            = { alb = "sg-00000000000000001", frontend = "sg-00000000000000002" }
    eks_cluster_name              = "as-docs-eks"
    eks_cluster_security_group_id = "sg-00000000000000003"
    eks_node_group_name           = "as-docs-private"
    eks_autoscaling_group_name    = "eks-fixture-asg"
  }
}

override_module {
  target = module.database
  outputs = {
    database_connection       = { host = "database.example.test" }
    db_master_user_secret_arn = "arn:aws:secretsmanager:us-east-1:111122223333:secret:fixture"
  }
}

override_module {
  target = module.edge
  outputs = {
    public_app_url     = "http://frontend.example.test"
    backend_url        = "http://backend.example.test:3000"
    frontend_instances = {}
    keycloak_issuer    = null
  }
}

override_data {
  target = data.aws_iam_roles.learner["cluster"]
  values = { arns = ["arn:aws:iam::111122223333:role/fixture-LabEksClusterRole-suffix"] }
}

override_data {
  target = data.aws_iam_roles.learner["nodes"]
  values = { arns = ["arn:aws:iam::111122223333:role/fixture-LabEksNodeRole-suffix"] }
}

run "lab_exports_the_connection_details_of_all_three_modules" {
  command   = plan
  state_key = "managed"

  variables {
    iam_mode = "managed"
  }

  assert {
    condition     = output.eks_cluster_name == "as-docs-eks" && output.database_connection.host == "database.example.test" && output.public_app_url == "http://frontend.example.test"
    error_message = "A raiz portátil deve expor os dados do EKS, do RDS e da borda."
  }

  assert {
    condition = (
      output.aws_account_id == "111122223333" &&
      output.db_master_user_secret_arn == "arn:aws:secretsmanager:us-east-1:111122223333:secret:fixture" &&
      toset(keys(aws_iam_role.workload)) == toset(["cluster", "nodes", "frontend", "ebs-csi"]) &&
      aws_iam_instance_profile.frontend[0].role == aws_iam_role.workload["frontend"].name &&
      aws_iam_role_policy_attachment.workload["ebs-csi/AmazonEBSCSIDriverPolicyV2"].role == aws_iam_role.workload["ebs-csi"].name &&
      aws_eks_addon.pod_identity[0].addon_name == "eks-pod-identity-agent" &&
      one(aws_eks_addon.ebs_csi[0].pod_identity_association).service_account == "ebs-csi-controller-sa"
    )
    error_message = "A raiz deve descobrir a conta e criar o IAM e o CSI, sem recursos preexistentes."
  }
}

run "vincula_state_a_conta_da_sessao" {
  command = apply

  variables {
    db_password    = "FixtureLearnerLabPassword00000001"
    openai_api_key = ""
  }

  assert {
    condition     = terraform_data.account.input == "111122223333"
    error_message = "O state deve registrar a conta que executou o primeiro apply."
  }
}

run "rejeita_reuso_do_state_em_outra_conta" {
  command = plan

  variables {
    db_password = "FixtureLearnerLabPassword00000001"
  }

  override_data {
    target = data.aws_caller_identity.current
    values = { account_id = "444455556666" }
  }

  expect_failures = [terraform_data.account]
}

run "learner_lab_reusa_roles_sem_escritas_no_iam" {
  command   = plan
  state_key = "learner"

  variables {
    db_password = "FixtureLearnerLabPassword00000001"
  }

  assert {
    condition = (
      local.eks_cluster_role_arn == "arn:aws:iam::111122223333:role/fixture-LabEksClusterRole-suffix" &&
      local.eks_node_role_arn == "arn:aws:iam::111122223333:role/fixture-LabEksNodeRole-suffix" &&
      local.frontend_instance_profile_name == "LabInstanceProfile" &&
      length(aws_iam_role.workload) == 0 && length(aws_iam_role_policy_attachment.workload) == 0 &&
      length(aws_iam_instance_profile.frontend) == 0 && length(aws_eks_addon.pod_identity) == 0 &&
      length(aws_eks_addon.ebs_csi) == 0
    )
    error_message = "O modo padrão deve descobrir as roles do Learner Lab e não criar ou alterar IAM nem Pod Identity."
  }
}

run "learner_lab_aceita_arns_sem_listar_roles" {
  command   = plan
  state_key = "learner"

  variables {
    db_password          = "FixtureLearnerLabPassword00000001"
    eks_cluster_role_arn = "arn:aws:iam::111122223333:role/path/LabEksClusterRole"
    eks_node_role_arn    = "arn:aws:iam::111122223333:role/path/LabEksNodeRole"
  }

  assert {
    condition     = length(data.aws_iam_roles.learner) == 0 && local.eks_cluster_role_arn == var.eks_cluster_role_arn && local.eks_node_role_arn == var.eks_node_role_arn
    error_message = "Ao informar as duas roles, o Terraform não deve listar o IAM."
  }
}

run "learner_lab_rejeita_descoberta_ambigua" {
  command   = plan
  state_key = "learner"

  variables {
    db_password = "FixtureLearnerLabPassword00000001"
  }

  override_data {
    target = data.aws_iam_roles.learner["cluster"]
    values = { arns = ["arn:aws:iam::111122223333:role/one-LabEksClusterRole", "arn:aws:iam::111122223333:role/two-LabEksClusterRole"] }
  }

  expect_failures = [data.aws_iam_roles.learner["cluster"]]
}

run "ai_oauth_usa_issuer_e_identidade_do_lab" {
  command = plan
  variables {
    iam_mode         = "managed"
    keycloak_enabled = true
    ai_oauth = {
      backend_image = "registry.example.test/backend@sha256:1111111111111111111111111111111111111111111111111111111111111111"
      ai_image      = "registry.example.test/ai@sha256:2222222222222222222222222222222222222222222222222222222222222222"
      caddy_image   = "registry.example.test/caddy@sha256:3333333333333333333333333333333333333333333333333333333333333333"
      provider_mode = "diagnostic"
    }
  }
  override_module {
    target = module.edge
    outputs = {
      public_app_url     = "https://docs.example.test"
      backend_url        = "http://backend.example.test:3000"
      frontend_instances = {}
      keycloak_issuer    = "https://docs.example.test/id/realms/as-docs"
    }
  }
  assert {
    condition = (
      one(terraform_data.ai_oauth).input.issuer == "https://docs.example.test/id/realms/as-docs" &&
      one(terraform_data.ai_oauth).input.account == "111122223333" &&
      one(terraform_data.ai_oauth).input.cluster == "as-docs-eks" &&
      one(terraform_data.ai_oauth).input.images.provider_mode == "diagnostic"
    )
    error_message = "O deploy deve usar a conta, cluster e issuer do próprio state."
  }
}

run "apply_agenda_deploy_com_imagens_fixadas_e_recursos_do_lab" {
  command = plan
  variables {
    db_password       = "FixtureLearnerLabPassword00000001"
    keycloak_enabled  = true
    keycloak_lab_http = true
    app_deploy = {
      backend_image  = "111122223333.dkr.ecr.us-east-1.amazonaws.com/as-docs-backend@sha256:1111111111111111111111111111111111111111111111111111111111111111"
      frontend_image = "111122223333.dkr.ecr.us-east-1.amazonaws.com/as-docs-frontend@sha256:2222222222222222222222222222222222222222222222222222222222222222"
    }
  }
  override_module {
    target = module.edge
    outputs = {
      public_app_url  = "http://as-docs-public-123456.us-east-1.elb.amazonaws.com"
      backend_url     = "http://as-docs-internal-123456.elb.us-east-1.amazonaws.com:3000"
      keycloak_issuer = "http://as-docs-public-123456.us-east-1.elb.amazonaws.com/id/realms/as-docs"
      frontend_instances = {
        us-east-1a = { id = "i-0123456789abcdef0", private_ip = "10.0.0.10" }
        us-east-1b = { id = "i-0123456789abcdef1", private_ip = "10.0.1.10" }
      }
      integration = { frontend_target_group = "arn:aws:elasticloadbalancing:us-east-1:111122223333:targetgroup/as-docs-frontend/0123456789abcdef" }
    }
  }
  assert {
    condition = (
      one(terraform_data.app_backend).input.image == var.app_deploy.backend_image &&
      one(terraform_data.app_backend).input.cluster == "as-docs-eks" &&
      one(terraform_data.app_frontend).input.image == var.app_deploy.frontend_image &&
      toset(one(terraform_data.app_frontend).input.instances) == toset(["i-0123456789abcdef0", "i-0123456789abcdef1"]) &&
      one(terraform_data.app_frontend).input.target_group == "arn:aws:elasticloadbalancing:us-east-1:111122223333:targetgroup/as-docs-frontend/0123456789abcdef"
    )
    error_message = "O deploy precisa usar as imagens fixadas e os destinos do próprio lab."
  }
}

run "openai_provisiona_secret_mesmo_antes_de_ativar_ia" {
  command = plan
  variables {
    db_password            = "FixtureLearnerLabPassword00000001"
    openai_secret_revision = 1
    openai_api_key         = "fixture-openai-key-only-in-test"
  }
  assert {
    condition = (
      length(terraform_data.ai_oauth) == 0 &&
      one(terraform_data.openai_secret).input.account == "111122223333" &&
      one(terraform_data.openai_secret).input.cluster == "as-docs-eks" &&
      one(terraform_data.openai_secret).triggers_replace.revision == 1
    )
    error_message = "A chave deve chegar ao cluster do lab mesmo com o workload da IA desligado."
  }
}

run "openai_rejeita_revisao_sem_chave" {
  command = plan
  variables {
    db_password            = "FixtureLearnerLabPassword00000001"
    openai_secret_revision = 1
  }
  expect_failures = [var.openai_api_key]
}

run "lab_integral_planeja_bootstrap_e_publicacao_em_state_novo" {
  command   = plan
  state_key = "integral"

  variables {
    db_password            = "FixtureLearnerLabPassword00000001"
    lab_full_deploy        = true
    lab_ai_checkout        = "tests/fixtures/ai"
    openai_secret_revision = 1
    openai_api_key         = "fixture-openai-key-only-in-test"
  }

  override_module {
    target = module.edge
    outputs = {
      public_app_url     = "http://as-docs-public-123456.us-east-1.elb.amazonaws.com"
      backend_url        = "http://backend.example.test:3000"
      frontend_instances = {}
      keycloak_issuer    = "http://as-docs-public-123456.us-east-1.elb.amazonaws.com/id/realms/as-docs"
      integration        = { frontend_target_group = "arn:aws:elasticloadbalancing:us-east-1:111122223333:targetgroup/as-docs-frontend/0123456789abcdef" }
    }
  }

  assert {
    condition = (
      toset(keys(aws_ecr_repository.lab)) == toset(["frontend", "backend", "ai"]) &&
      alltrue([for repo in aws_ecr_repository.lab : repo.image_tag_mutability == "IMMUTABLE"]) &&
      alltrue([for tag in values(local.image_tags) : can(regex("^lab-[0-9a-f]{24}$", tag))]) &&
      local.keycloak_enabled && local.keycloak_lab_http &&
      length(terraform_data.publish_images) == 1 && length(terraform_data.bootstrap_db) == 1 &&
      length(terraform_data.oidc_prepare) == 1 && length(terraform_data.oidc_links) == 1 &&
      length(terraform_data.app_backend) == 1 && length(terraform_data.app_frontend) == 1 &&
      length(terraform_data.ai_oauth) == 1 && length(terraform_data.openai_secret) == 1
    )
    error_message = "Um único plano precisa agendar imagens, bootstrap, app e IA sem digests preexistentes."
  }
}
