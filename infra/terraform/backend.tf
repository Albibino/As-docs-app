terraform {
  backend "s3" {
    bucket       = "as-docs-tfstate-967931808920-us-east-1"
    key          = "as-docs/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
