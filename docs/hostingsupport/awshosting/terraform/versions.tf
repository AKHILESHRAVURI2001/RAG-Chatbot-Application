# What this file does: pins the exact versions of Terraform itself and the
# AWS/random "providers" (plugins Terraform uses to talk to AWS and to
# generate random values). Pinning versions means "this config is guaranteed
# to behave the same way every time it's run" — without it, a Terraform
# upgrade six months from now could silently change how resources are created.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# The "provider" block configures *how* Terraform authenticates to AWS.
# It reuses whatever credentials are already active in your shell —
# the same ones `aws sts get-caller-identity` would show — via `aws login`.
# Nothing AWS-account-specific is hardcoded here.
provider "aws" {
  region = var.aws_region
}
