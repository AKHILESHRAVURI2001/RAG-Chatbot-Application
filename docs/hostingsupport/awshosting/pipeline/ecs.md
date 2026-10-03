# Deploying to ECS (Fargate)

This reuses the **same VPC, subnets, security groups, ALB, RDS, and ElastiCache** from [`../aws-cli/manual-setup.md`](../aws-cli/manual-setup.md) — only the compute layer changes: instead of an Auto Scaling Group of EC2 instances running `pm2`, ECS runs your Docker containers directly, and you never see or manage the underlying servers at all (that's what "Fargate" means).

> **Practical note before you start**: the admin dashboard and widget are just static files — S3 + CloudFront (as in the EC2 path) is genuinely simpler and cheaper for them than running them as containers. This guide covers all three anyway, since the Dockerfiles exist and it's useful to see the full pattern — but in a real deployment, consider only putting the **server** on ECS and keeping admin/widget on S3 + CloudFront.

## 1. Push images to ECR

```bash
export AWS_REGION=us-east-1
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# One repository per app
for repo in mcb-server mcb-admin mcb-widget; do
  aws ecr create-repository --repository-name $repo --region $AWS_REGION
done

# Authenticate Docker to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build and push each image (run from the repo root)
docker build -f apps/server/Dockerfile -t $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/mcb-server:latest .
docker push $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/mcb-server:latest

docker build -f apps/admin/Dockerfile --build-arg VITE_API_BASE_URL=https://YOUR_LIVE_DOMAIN/api \
  -t $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/mcb-admin:latest .
docker push $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/mcb-admin:latest

docker build -f apps/widget/Dockerfile -t $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/mcb-widget:latest .
docker push $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/mcb-widget:latest
```

## 2. Create the ECS cluster

An ECS "cluster" with Fargate is really just a logical grouping — there are no servers to configure.

```bash
aws ecs create-cluster --cluster-name mcb-cluster --region $AWS_REGION
```

## 3. IAM roles ECS needs

Two different roles, for two different jobs:
- **Task execution role** — lets ECS itself pull the image from ECR and write logs. AWS provides a ready-made policy for this.
- **Task role** — what the *app inside the container* is allowed to do (same idea as `mcb-ec2-role` in the EC2 path: read the app secret).

```bash
cat > /tmp/ecs-trust.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}
EOF

aws iam create-role --role-name mcb-ecs-execution-role --assume-role-policy-document file:///tmp/ecs-trust.json
aws iam attach-role-policy --role-name mcb-ecs-execution-role --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

aws iam create-role --role-name mcb-ecs-task-role --assume-role-policy-document file:///tmp/ecs-trust.json
# Attach the same secret-read policy used by mcb-ec2-role in ../aws-cli/manual-setup.md step 8
```

## 4. Task definition (the server)

This is the container equivalent of the Launch Template's `user_data.sh` — except there's no boot script to write, because the image already *is* the built app. Configuration (the database URL, secrets) is injected as environment/secrets, not baked into the image.

```json
{
  "family": "mcb-server",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/mcb-ecs-execution-role",
  "taskRoleArn": "arn:aws:iam::ACCOUNT_ID:role/mcb-ecs-task-role",
  "containerDefinitions": [
    {
      "name": "mcb-server",
      "image": "ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/mcb-server:latest",
      "portMappings": [{ "containerPort": 4000, "protocol": "tcp" }],
      "environment": [
        { "name": "PORT", "value": "4000" },
        { "name": "NODE_ENV", "value": "production" },
        { "name": "ALLOWED_ORIGINS", "value": "*" },
        { "name": "ADMIN_ORIGINS", "value": "*" },
        { "name": "DATABASE_URL", "value": "postgresql://mcbadmin:PASSWORD@YOUR_RDS_ENDPOINT:5432/minichatbot" },
        { "name": "DATABASE_SSL", "value": "true" },
        { "name": "REDIS_URL", "value": "redis://YOUR_REDIS_ENDPOINT:6379" }
      ],
      "secrets": [
        { "name": "ADMIN_JWT_SECRET", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:mcb/app-env:ADMIN_JWT_SECRET::" },
        { "name": "GEMINI_API_KEY", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:mcb/app-env:GEMINI_API_KEY::" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/mcb-server",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "mcb"
        }
      }
    }
  ]
}
```

Note the `"secrets"` block: unlike the EC2 boot script (which had to manually `aws secretsmanager get-secret-value` and write a `.env` file itself), ECS injects individual fields of a Secrets Manager secret directly as environment variables — no extra code needed.

```bash
aws logs create-log-group --log-group-name /ecs/mcb-server --region $AWS_REGION
aws ecs register-task-definition --cli-input-json file:///tmp/mcb-server-task.json --region $AWS_REGION
```

## 5. Target group + service

Reuse the same ALB from the EC2 path (or create a new one) — just a new target group, since Fargate tasks register themselves by IP, not by EC2 instance ID:

```bash
TG_ARN=$(aws elbv2 create-target-group --name mcb-server-tg --protocol HTTP --port 4000 \
  --vpc-id $VPC_ID --target-type ip \
  --health-check-path /api/health --region $AWS_REGION --query 'TargetGroups[0].TargetGroupArn' --output text)

aws elbv2 create-rule --listener-arn $LISTENER_ARN --priority 10 \
  --conditions Field=path-pattern,Values='/api/*' \
  --actions Type=forward,TargetGroupArn=$TG_ARN --region $AWS_REGION

aws ecs create-service \
  --cluster mcb-cluster \
  --service-name mcb-server \
  --task-definition mcb-server \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIV_SUB1,$PRIV_SUB2],securityGroups=[$EC2_SG],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=mcb-server,containerPort=4000" \
  --region $AWS_REGION
```

## 6. Auto scaling (ECS's equivalent of the ASG target-tracking policy)

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs --resource-id service/mcb-cluster/mcb-server \
  --scalable-dimension ecs:service:DesiredCount --min-capacity 1 --max-capacity 6 --region $AWS_REGION

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs --resource-id service/mcb-cluster/mcb-server \
  --scalable-dimension ecs:service:DesiredCount --policy-name mcb-cpu-target-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{"TargetValue":60.0,"PredefinedMetricSpecification":{"PredefinedMetricType":"ECSServiceAverageCPUUtilization"}}' \
  --region $AWS_REGION
```

## Shipping a code change

This is the entire reason containers + an orchestrator are worth the extra concepts: shipping a change is now "build a new image, tell ECS to use it" — no artifact packaging, no SSM commands, no manual instance patching:

```bash
docker build -f apps/server/Dockerfile -t $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/mcb-server:latest .
docker push $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/mcb-server:latest
aws ecs update-service --cluster mcb-cluster --service mcb-server --force-new-deployment --region $AWS_REGION
```

ECS then does a **rolling deployment**: starts new containers with the new image, waits for them to pass health checks, only then stops the old ones — the same "no downtime" property the ASG instance refresh had in the EC2 path. See [`jenkins.md`](jenkins.md) to automate exactly this sequence on every git push.
