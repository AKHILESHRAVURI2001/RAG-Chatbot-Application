# ============================================================================
# DATABASE — RDS PostgreSQL (Multi-AZ)
# ============================================================================
# RDS is AWS's "managed database" service: AWS handles patching, backups,
# and (with Multi-AZ) automatic failover, so we don't have to run and
# babysit Postgres ourselves on a server. It lives in the private subnets
# only — it has no public IP and only the app servers can reach it
# (see security_groups.tf).

# random_password generates the database's master password once, the
# first time this is applied, and Terraform remembers it afterward (in its
# "state") — it's never typed by a human and never appears in this file.
resource "random_password" "db" {
  length  = 32
  special = false # Postgres connection strings choke on some special characters
}

# A "subnet group" just tells RDS which subnets it's allowed to place the
# database into — here, both private subnets, so Multi-AZ has two separate
# data centers to actually place its primary and standby copies in.
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnets"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${var.project_name}-db-subnets" }
}

resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-postgres"
  engine         = "postgres"
  engine_version = "16.4"
  instance_class = var.db_instance_class

  db_name  = "minichatbot"
  username = "mcbadmin"
  password = random_password.db.result

  allocated_storage = var.db_allocated_storage_gb
  storage_type      = "gp3"
  storage_encrypted = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  multi_az                = var.db_multi_az
  backup_retention_period = var.db_backup_retention_days

  skip_final_snapshot = true # set to false for a real production app you'd never want to lose

  tags = { Name = "${var.project_name}-postgres" }
}
