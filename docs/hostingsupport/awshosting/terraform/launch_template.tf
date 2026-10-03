# ============================================================================
# LAUNCH TEMPLATE — the "recipe" for a single app server
# ============================================================================
# This doesn't create a server by itself — it's the blueprint the Auto
# Scaling Group (asg.tf) uses every time it needs to launch one, whether
# that's the first server ever, one more under load, or a replacement for
# one that just crashed. Change something here (a new Node version, a
# different instance size) and every *future* server picks it up
# automatically — nothing to configure by hand on each machine.

# Always use the latest official Amazon Linux 2023 image, rather than a
# hardcoded AMI ID that goes stale (and eventually unsupported) over time.
data "aws_ssm_parameter" "al2023_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

resource "aws_launch_template" "app" {
  name_prefix   = "${var.project_name}-app-"
  image_id      = data.aws_ssm_parameter.al2023_ami.value # Linux (Amazon Linux 2023)
  instance_type = var.instance_type

  iam_instance_profile {
    name = aws_iam_instance_profile.ec2.name
  }

  vpc_security_group_ids = [aws_security_group.ec2.id]

  # The boot script (user_data.sh.tftpl) with its placeholders filled in
  # with real values from the other resources — the S3 bucket that
  # actually exists, the RDS endpoint that actually exists, etc. Terraform
  # wires these together automatically; nothing is copy-pasted by hand.
  user_data = base64encode(templatefile("${path.module}/user_data.sh.tftpl", {
    artifact_bucket = aws_s3_bucket.artifacts.bucket
    region          = var.aws_region
    app_secret_name = aws_secretsmanager_secret.app_env.name
    rds_endpoint    = aws_db_instance.main.address
    redis_endpoint  = aws_elasticache_cluster.main.cache_nodes[0].address
  }))

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.project_name}-app" }
  }

  lifecycle {
    create_before_destroy = true
  }
}
