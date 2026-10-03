# "Outputs" are what Terraform prints after it finishes — the values you
# actually need afterward to use or debug the thing it just built.
# Run `terraform output` any time later to see these again without
# re-applying anything.

output "live_url" {
  description = "The public URL for the whole app (admin dashboard, widget, API)."
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "alb_dns_name" {
  description = "The load balancer's own address — useful for testing the API directly, bypassing CloudFront's cache."
  value       = aws_lb.main.dns_name
}

output "rds_endpoint" {
  description = "The database's private address (only reachable from inside the VPC, e.g. from an app server via SSM)."
  value       = aws_db_instance.main.address
}

output "redis_endpoint" {
  description = "The cache's private address."
  value       = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "static_bucket_name" {
  description = "Where the admin dashboard build and widget.js get uploaded — see ../redeploy.md."
  value       = aws_s3_bucket.static.bucket
}

output "artifacts_bucket_name" {
  description = "Where the packaged server code gets uploaded — see ../redeploy.md."
  value       = aws_s3_bucket.artifacts.bucket
}

output "auto_scaling_group_name" {
  description = "Use this with the AWS CLI/Console to see current instance count, trigger an instance refresh, etc."
  value       = aws_autoscaling_group.app.name
}

output "app_secret_name" {
  description = "The Secrets Manager secret holding the app's runtime .env values."
  value       = aws_secretsmanager_secret.app_env.name
}
