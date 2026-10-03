# ============================================================================
# SECRETS MANAGER — where passwords and API keys actually live
# ============================================================================
# None of the values below are typed into the Launch Template, an AMI, or
# anywhere else a person browsing the AWS Console would stumble across
# them. Instead, they're stored once here, and each app server reads them
# for itself when it boots (see the IAM permission in iam.tf and the
# boot script in launch_template.tf). If a key ever needs to change,
# you update it here — new instances pick it up automatically the next
# time they boot.

resource "random_password" "admin_jwt_secret" {
  length  = 32
  special = true
}

# This secret becomes /opt/mcb/.env on every app server. Anything the app
# needs at runtime that shouldn't be world-readable goes here.
resource "aws_secretsmanager_secret" "app_env" {
  name = "${var.project_name}/app-env"
}

resource "aws_secretsmanager_secret_version" "app_env" {
  secret_id = aws_secretsmanager_secret.app_env.id
  secret_string = jsonencode({
    ADMIN_JWT_SECRET = random_password.admin_jwt_secret.result
    DB_PASSWORD      = random_password.db.result
    GEMINI_API_KEY   = var.gemini_api_key
    SARVAM_API_KEY   = var.sarvam_api_key
  })
}
