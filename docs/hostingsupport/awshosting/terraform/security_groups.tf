# ============================================================================
# SECURITY GROUPS — the firewall rules between each layer
# ============================================================================
# Think of these as "who's allowed to knock on this door." Each one only
# allows traffic from the *specific other layer* that legitimately needs it —
# never "anyone", except the load balancer's public port 80, which is the
# one intentional front door. This is called least-privilege networking:
# the database, for example, can ONLY ever be reached by the app servers,
# never directly from the internet, not even by us.

# Layer 1: the internet -> the load balancer. Wide open on 80, because
# that's the one thing meant to be public.
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-sg"
  description = "Allows public HTTP traffic into the load balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-alb-sg" }
}

# Layer 2: the load balancer -> the app servers. Only the ALB's security
# group is allowed in, on the app's port (4000) — nothing else, including
# not even other things inside the same VPC.
resource "aws_security_group" "ec2" {
  name        = "${var.project_name}-ec2-sg"
  description = "Allows the load balancer to reach the app servers"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "App port from the ALB only"
    from_port       = 4000
    to_port         = 4000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-ec2-sg" }
}

# Layer 3: the app servers -> the database. Only the app servers' security
# group is allowed in, on Postgres's port. The database has no public IP
# at all, so this is the *only* way in, from anywhere.
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "Allows only the app servers to reach Postgres"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres from the app servers only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-rds-sg" }
}

# Layer 4: the app servers -> the cache. Same idea as the database.
resource "aws_security_group" "cache" {
  name        = "${var.project_name}-cache-sg"
  description = "Allows only the app servers to reach Redis"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis from the app servers only"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-cache-sg" }
}

# Note: there is deliberately no security group rule anywhere opening port
# 22 (SSH). Access to an app server for debugging goes through AWS Systems
# Manager Session Manager instead (see iam.tf) — it needs no open inbound
# port at all, and every command run through it is logged in CloudTrail.
