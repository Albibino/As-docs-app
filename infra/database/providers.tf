provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = ["362749056012"]

  default_tags {
    tags = {
      Project     = "as-docs"
      Environment = "academico"
      ManagedBy   = "Terraform"
      Stage       = "04-banco"
    }
  }
}

# Apenas lê os outputs da infraestrutura aplicada. O banco tem sua própria
# chave de state e não passa a gerenciar recursos do outro diretório.
data "terraform_remote_state" "network" {
  backend = "s3"
  config = {
    bucket              = "as-docs-tfstate-362749056012-us-east-1"
    key                 = "as-docs/terraform.tfstate"
    region              = "us-east-1"
    allowed_account_ids = ["362749056012"]
  }
}
