# 4. ElastiCache (Redis)

← [Back to overview](README.md) | **You are here: Step 4 of 13** | ← Previous: [3. RDS PostgreSQL Database](03-rds.md)

Search for the **ElastiCache** service.

1. Left sidebar → **Redis caches** → **Create Redis cache**.
2. Choose **Design your own cache** (not Serverless) for a fixed, predictable-cost setup.
3. **Cluster mode**: Disabled
4. **Name**: `mcb-redis`
5. **Node type**: `cache.t4g.micro`
6. **Number of replicas**: 0 (a single node — fine for this scale)
7. **Subnet group** → **Create a new subnet group**: name `mcb-cache-subnets`, VPC `mcb-vpc`, select `mcb-private-1` and `mcb-private-2`
8. **Security groups**: select `mcb-cache-sg` (remove the default one)
9. **Create**

This takes a few minutes to reach **Available**.

## ✅ Checkpoint before moving on
- Status shows **Available**
- Copy its **Primary endpoint** (or just "Endpoint" for a single node) — looks like `mcb-redis.xxxxx.use1.cache.amazonaws.com`. You'll need this in step 9.

---
**Next →** [5. S3 Buckets](05-s3.md)
