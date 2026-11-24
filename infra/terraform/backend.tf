terraform {
  backend "s3" {
    bucket              = "as-docs-tfstate-362749056012-us-east-1"
    key                 = "as-docs/terraform.tfstate"
    region              = "us-east-1"
    encrypt             = true
    use_lockfile        = true
    allowed_account_ids = ["362749056012"]
  }
}
