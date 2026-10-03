# 9. Launch Template + Auto Scaling Group

← [Back to overview](README.md) | **You are here: Step 9 of 13** | ← Previous: [8. Application Load Balancer](08-load-balancer.md)

This is the "recipe for one app server" plus "how many should exist right now."

## 9.1 Launch Template
In EC2 → left sidebar → **Launch Templates** → **Create launch template**.

- **Name**: `mcb-app-lt`
- **AMI**: search "Amazon Linux 2023" and pick the current AWS-provided one (it'll show as e.g. "Amazon Linux 2023 AMI" — this is a **Linux** operating system; there is no Windows anywhere in this stack)
- **Instance type**: `t3.micro`
- **Key pair**: **Proceed without a key pair** — you don't need SSH access; see [step 11](11-access-instance.md) for how to actually get onto the instance
- **Network settings → Security groups**: select `mcb-ec2-sg`
- **Advanced details**:
  - **IAM instance profile**: `mcb-ec2-role`
  - **User data** — paste the boot script below, after replacing the placeholders in ALL CAPS with your real values from earlier steps (artifacts bucket name from [step 5](05-s3.md), RDS endpoint from [step 3](03-rds.md), Redis endpoint from [step 4](04-elasticache.md)):

```bash
#!/bin/bash
set -e
exec > /var/log/mcb-bootstrap.log 2>&1

dnf install -y jq
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
node --version

npm install -g pm2

mkdir -p /opt/mcb && cd /opt/mcb
aws s3 cp s3://YOUR_ARTIFACTS_BUCKET/mcb-server-v1.tar.gz /opt/mcb/artifact.tar.gz --region us-east-1
tar xzf artifact.tar.gz

SECRET=$(aws secretsmanager get-secret-value --secret-id mcb/app-env --region us-east-1 --query SecretString --output text)
ADMIN_JWT_SECRET=$(echo "$SECRET" | jq -r .ADMIN_JWT_SECRET)
DB_PASSWORD=$(echo "$SECRET" | jq -r .DB_PASSWORD)
GEMINI_API_KEY=$(echo "$SECRET" | jq -r .GEMINI_API_KEY)
SARVAM_API_KEY=$(echo "$SECRET" | jq -r .SARVAM_API_KEY)

cat > /opt/mcb/.env <<ENVEOF
PORT=4000
NODE_ENV=production
ALLOWED_ORIGINS=*
ADMIN_ORIGINS=*
DATABASE_URL=postgresql://mcbadmin:${DB_PASSWORD}@YOUR_RDS_ENDPOINT:5432/minichatbot
DATABASE_SSL=true
ADMIN_JWT_SECRET=${ADMIN_JWT_SECRET}
ADMIN_JWT_EXPIRES_IN=7d
REDIS_URL=redis://YOUR_REDIS_ENDPOINT:6379
CACHE_TTL_SECONDS=86400
FAQ_SIMILARITY_THRESHOLD=0.87
GEMINI_API_KEY=${GEMINI_API_KEY}
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
FIREBASE_SERVICE_ACCOUNT_JSON=
SARVAM_API_KEY=${SARVAM_API_KEY}
ENVEOF

npm install --omit=dev --prefix /opt/mcb

pm2 delete mcb-server || true
pm2 start /opt/mcb/dist/index.js --name mcb-server --cwd /opt/mcb
pm2 save
pm2 startup systemd -u root --hp /root > /tmp/pm2-startup-out.txt 2>&1 || true
grep -E '^(sudo )?env ' /tmp/pm2-startup-out.txt | sed 's/^sudo //' | bash || true

echo "Bootstrap complete"
```

> **Important**: `YOUR_ARTIFACTS_BUCKET` needs to already have `mcb-server-v1.tar.gz` uploaded for this to work — see [step 10](10-build-and-upload-code.md) for how to build and upload it. It's normal/expected that you'll come back and create a **new Launch Template version** after you've built and uploaded the real code the first time — the very first launch will crash-loop until that artifact exists, and that's fine.

- **Create launch template**

## 9.2 Auto Scaling Group
Left sidebar → **Auto Scaling Groups** → **Create Auto Scaling group**.

1. **Name**: `mcb-asg`
2. **Launch template**: `mcb-app-lt`, version **Latest**
3. **VPC**: `mcb-vpc`; **Subnets**: select `mcb-private-1` and `mcb-private-2` (the app servers live in private subnets)
4. **Load balancing**: **Attach to an existing load balancer** → choose your target group `mcb-app-tg`
5. **Health checks**: turn on **Elastic Load Balancing health checks** (this makes the ASG trust the ALB's `/api/health` check, not just "is the instance powered on")
6. **Health check grace period**: 180 seconds
7. **Group size**: Desired `1`, Minimum `1`, Maximum `6`
8. **Scaling policies** → **Target tracking scaling policy**:
   - Metric type: **Average CPU utilization**
   - Target value: `60`
9. **Create Auto Scaling group**

## ✅ Checkpoint before moving on
- Launch Template `mcb-app-lt` exists (version 1 — expect to add a version 2 after step 10)
- ASG `mcb-asg` exists; its **Instance management** tab shows one instance, likely still `Pending`/`Unhealthy` until step 10 is done (the artifact it needs doesn't exist yet — that's expected)

---
**Next →** [10. Build and Upload the Actual App Code](10-build-and-upload-code.md)
