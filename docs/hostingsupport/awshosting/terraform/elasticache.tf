# ============================================================================
# CACHE — ElastiCache Redis
# ============================================================================
# The app already knows how to use Redis for caching repeated questions/
# answers (apps/server/src/cache/redis.ts) — with a single app server that
# cache could just live in that server's own memory, but the moment there's
# more than one app server (which Auto Scaling will do under load), each
# server would otherwise keep its own separate cache, silently giving
# different answers depending on which server happens to handle a request.
# A shared Redis instance fixes that: one cache, used by every app server.

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-cache-subnets"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.project_name}-redis"
  engine               = "redis"
  node_type            = var.cache_node_type
  num_cache_nodes      = 1
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.cache.id]
  port                 = 6379

  tags = { Name = "${var.project_name}-redis" }
}
