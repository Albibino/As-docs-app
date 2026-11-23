provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.expected_account_id]

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = "academico"
      ManagedBy   = "Terraform"
      Stage       = "01-rede"
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "zone-type"
    values = ["availability-zone"]
  }
}
