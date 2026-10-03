# ============================================================================
# IAM — what an app server is allowed to do
# ============================================================================
# By default, an EC2 instance can't touch any other AWS resource at all —
# not even one of "your own" S3 buckets. It has to be explicitly handed a
# "role" (a bundle of permissions) to do anything. This is the same
# least-privilege idea as the security groups: the app server gets exactly
# the 3 permissions it needs, nothing more:
#
#   1. Read the one secret it needs (secrets.tf) — not every secret in the account
#   2. Download the deploy artifact from the one S3 bucket it needs — not every bucket
#   3. Use AWS Systems Manager, so we can run commands / open a shell on it
#      without ever opening an SSH port

# The "trust policy" — this says *which AWS service* is allowed to use this
# role at all. Here: only EC2 instances, nothing else.
data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2" {
  name               = "${var.project_name}-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
}

# The actual permissions granted (1) and (2) above.
data "aws_iam_policy_document" "ec2_permissions" {
  statement {
    sid       = "ReadAppSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.app_env.arn]
  }

  statement {
    sid       = "ReadDeployArtifacts"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]
  }
}

resource "aws_iam_role_policy" "ec2_permissions" {
  name   = "${var.project_name}-ec2-access"
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.ec2_permissions.json
}

# Permission (3): a ready-made AWS policy that enables Systems Manager
# Session Manager / Run Command on this instance.
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# EC2 doesn't attach a role directly — it attaches an "instance profile",
# which is just a thin wrapper around the role.
resource "aws_iam_instance_profile" "ec2" {
  name = "${var.project_name}-ec2-profile"
  role = aws_iam_role.ec2.name
}
