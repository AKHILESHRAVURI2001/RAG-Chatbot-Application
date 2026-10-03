# "Variables" are Terraform's inputs — the knobs you're allowed to turn
# without editing the resource definitions themselves. Anyone reusing this
# config (a different AWS account, a staging vs. production copy) only
# needs to change values here, in a terraform.tfvars file — never the
# actual .tf resource files.

variable "aws_region" {
  description = "AWS region everything gets created in."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short prefix put on every resource name (e.g. \"mcb\" -> mcb-vpc, mcb-alb, ...). Change this if you deploy a second copy in the same account so names don't collide."
  type        = string
  default     = "mcb"
}

variable "vpc_cidr" {
  description = "IP address range for the whole private network this app lives in. 10.42.0.0/16 gives ~65,000 addresses, split into 4 subnets below — far more than this app needs, but costs nothing extra and leaves room to grow."
  type        = string
  default     = "10.42.0.0/16"
}

variable "instance_type" {
  description = "EC2 size for the app servers. t3.micro is the cheapest size that comfortably runs Node; bump this first if the app ever feels slow under real load, before adding more instances."
  type        = string
  default     = "t3.micro"
}

variable "asg_min_size" {
  description = "Fewest app servers ever running, even at zero traffic. 1 means there's always something serving requests."
  type        = number
  default     = 1
}

variable "asg_max_size" {
  description = "Most app servers Auto Scaling is allowed to launch under heavy load. Raising this is the main lever for handling more simultaneous users."
  type        = number
  default     = 6
}

variable "asg_desired_capacity" {
  description = "How many app servers to run right now, under normal conditions. Auto Scaling adjusts this automatically between min and max as load changes; this is just the starting point."
  type        = number
  default     = 1
}

variable "db_instance_class" {
  description = "RDS (database) server size."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage_gb" {
  description = "Database disk size in GB."
  type        = number
  default     = 20
}

variable "db_multi_az" {
  description = "If true, RDS keeps a live standby copy of the database in a second data center and fails over to it automatically if the primary has a problem. This is what \"production-grade database\" mostly means. Costs roughly double the database's compute cost."
  type        = bool
  default     = true
}

variable "db_backup_retention_days" {
  description = "How many days of automatic database backups RDS keeps. NOTE: on an AWS account still under free-tier restrictions, this must stay at 1 — anything higher is rejected with a FreeTierRestrictionError. Raise it once the account is upgraded."
  type        = number
  default     = 1
}

variable "cache_node_type" {
  description = "ElastiCache (Redis) server size."
  type        = string
  default     = "cache.t4g.micro"
}

variable "gemini_api_key" {
  description = "API key for Google Gemini (the LLM that answers chat questions). Leave blank to deploy without it and add it later via AWS Secrets Manager or the admin dashboard's Settings page."
  type        = string
  default     = ""
  sensitive   = true
}

variable "sarvam_api_key" {
  description = "API key for the Sarvam voice provider (speech-to-text / text-to-speech). Leave blank if the voice feature isn't in use yet."
  type        = string
  default     = ""
  sensitive   = true
}

variable "admin_email" {
  description = "Email address for the first admin login, created automatically after the database is migrated."
  type        = string
  default     = "admin@minichatbot.local"
}
