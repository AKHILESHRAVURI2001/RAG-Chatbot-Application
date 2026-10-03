# Manual Setup — Rebuild This Stack From Scratch

This walks through recreating the entire deployment with the AWS CLI, in the order it actually has to happen (later steps depend on IDs produced by earlier ones). Every command captures its output into a shell variable — keep a terminal open and just work top to bottom; by the end you'll have every ID this deployment needs.

Prerequisites: `aws` CLI v2.32+, logged in (`aws login`), Node 20+ locally, this repo checked out.

```bash
export AWS_REGION=us-east-1
```

---

## 1. Networking (VPC, subnets, NAT, routing)

```bash
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.42.0.0/16 --region $AWS_REGION \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=mcb-vpc}]' \
  --query 'Vpc.VpcId' --output text)
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-support "{\"Value\":true}" --region $AWS_REGION
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames "{\"Value\":true}" --region $AWS_REGION

IGW_ID=$(aws ec2 create-internet-gateway --region $AWS_REGION \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=mcb-igw}]' \
  --query 'InternetGateway.InternetGatewayId' --output text)
aws ec2 attach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID --region $AWS_REGION

AZ1=$(aws ec2 describe-availability-zones --region $AWS_REGION --query 'AvailabilityZones[0].ZoneName' --output text)
AZ2=$(aws ec2 describe-availability-zones --region $AWS_REGION --query 'AvailabilityZones[1].ZoneName' --output text)

PUB_SUB1=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.42.0.0/20 --availability-zone $AZ1 --region $AWS_REGION --query 'Subnet.SubnetId' --output text)
PUB_SUB2=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.42.16.0/20 --availability-zone $AZ2 --region $AWS_REGION --query 'Subnet.SubnetId' --output text)
PRIV_SUB1=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.42.32.0/20 --availability-zone $AZ1 --region $AWS_REGION --query 'Subnet.SubnetId' --output text)
PRIV_SUB2=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.42.48.0/20 --availability-zone $AZ2 --region $AWS_REGION --query 'Subnet.SubnetId' --output text)
aws ec2 modify-subnet-attribute --subnet-id $PUB_SUB1 --map-public-ip-on-launch --region $AWS_REGION
aws ec2 modify-subnet-attribute --subnet-id $PUB_SUB2 --map-public-ip-on-launch --region $AWS_REGION

# Public routing
PUB_RT=$(aws ec2 create-route-table --vpc-id $VPC_ID --region $AWS_REGION --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id $PUB_RT --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID --region $AWS_REGION
aws ec2 associate-route-table --subnet-id $PUB_SUB1 --route-table-id $PUB_RT --region $AWS_REGION
aws ec2 associate-route-table --subnet-id $PUB_SUB2 --route-table-id $PUB_RT --region $AWS_REGION

# NAT gateway (for private subnets to reach the internet)
EIP_ALLOC=$(aws ec2 allocate-address --domain vpc --region $AWS_REGION --query 'AllocationId' --output text)
NAT_ID=$(aws ec2 create-nat-gateway --subnet-id $PUB_SUB1 --allocation-id $EIP_ALLOC --region $AWS_REGION --query 'NatGateway.NatGatewayId' --output text)
aws ec2 wait nat-gateway-available --nat-gateway-ids $NAT_ID --region $AWS_REGION   # takes a few minutes

# Private routing
PRIV_RT=$(aws ec2 create-route-table --vpc-id $VPC_ID --region $AWS_REGION --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id $PRIV_RT --destination-cidr-block 0.0.0.0/0 --nat-gateway-id $NAT_ID --region $AWS_REGION
aws ec2 associate-route-table --subnet-id $PRIV_SUB1 --route-table-id $PRIV_RT --region $AWS_REGION
aws ec2 associate-route-table --subnet-id $PRIV_SUB2 --route-table-id $PRIV_RT --region $AWS_REGION
```

## 2. Security groups

```bash
ALB_SG=$(aws ec2 create-security-group --group-name mcb-alb-sg --description "ALB" --vpc-id $VPC_ID --region $AWS_REGION --query 'GroupId' --output text)
EC2_SG=$(aws ec2 create-security-group --group-name mcb-ec2-sg --description "App instances" --vpc-id $VPC_ID --region $AWS_REGION --query 'GroupId' --output text)
RDS_SG=$(aws ec2 create-security-group --group-name mcb-rds-sg --description "RDS" --vpc-id $VPC_ID --region $AWS_REGION --query 'GroupId' --output text)
CACHE_SG=$(aws ec2 create-security-group --group-name mcb-cache-sg --description "ElastiCache" --vpc-id $VPC_ID --region $AWS_REGION --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $AWS_REGION
aws ec2 authorize-security-group-ingress --group-id $EC2_SG --protocol tcp --port 4000 --source-group $ALB_SG --region $AWS_REGION
aws ec2 authorize-security-group-ingress --group-id $RDS_SG --protocol tcp --port 5432 --source-group $EC2_SG --region $AWS_REGION
aws ec2 authorize-security-group-ingress --group-id $CACHE_SG --protocol tcp --port 6379 --source-group $EC2_SG --region $AWS_REGION
```

No rule opens port 22 anywhere — instances are reached via SSM instead (see below).

## 3. RDS PostgreSQL

```bash
aws rds create-db-subnet-group --db-subnet-group-name mcb-db-subnets \
  --db-subnet-group-description "MCB private subnets" \
  --subnet-ids $PRIV_SUB1 $PRIV_SUB2 --region $AWS_REGION

DB_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g,'').slice(0,32))")

aws rds create-db-instance \
  --db-instance-identifier mcb-postgres \
  --db-instance-class db.t4g.micro \
  --engine postgres --engine-version 16.4 \
  --master-username mcbadmin --master-user-password "$DB_PASSWORD" \
  --allocated-storage 20 --storage-type gp3 \
  --db-name minichatbot \
  --vpc-security-group-ids $RDS_SG \
  --db-subnet-group-name mcb-db-subnets \
  --multi-az --no-publicly-accessible --storage-encrypted \
  --backup-retention-period 1 \
  --region $AWS_REGION
  # NOTE: --backup-retention-period must be 1 on a free-tier-restricted account
  #       (7+ throws FreeTierRestrictionError). Bump it once the account is upgraded.

aws rds wait db-instance-available --db-instance-identifier mcb-postgres --region $AWS_REGION   # ~10-15 min for Multi-AZ

RDS_ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier mcb-postgres --region $AWS_REGION --query 'DBInstances[0].Endpoint.Address' --output text)
```

## 4. ElastiCache Redis

```bash
aws elasticache create-cache-subnet-group --cache-subnet-group-name mcb-cache-subnets \
  --cache-subnet-group-description "MCB private subnets" \
  --subnet-ids $PRIV_SUB1 $PRIV_SUB2 --region $AWS_REGION

aws elasticache create-cache-cluster \
  --cache-cluster-id mcb-redis \
  --cache-node-type cache.t4g.micro --engine redis --num-cache-nodes 1 \
  --cache-subnet-group-name mcb-cache-subnets --security-group-ids $CACHE_SG \
  --region $AWS_REGION

REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters --cache-cluster-id mcb-redis --show-cache-node-info --region $AWS_REGION --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' --output text)
```

## 5. S3 buckets

```bash
SUFFIX=$(node -e "console.log(require('crypto').randomBytes(4).toString('hex'))")
STATIC_BUCKET="mcb-static-$SUFFIX"
ARTIFACT_BUCKET="mcb-deploy-artifacts-$SUFFIX"

aws s3api create-bucket --bucket $STATIC_BUCKET --region $AWS_REGION
aws s3api create-bucket --bucket $ARTIFACT_BUCKET --region $AWS_REGION
aws s3api put-public-access-block --bucket $STATIC_BUCKET --region $AWS_REGION \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
aws s3api put-public-access-block --bucket $ARTIFACT_BUCKET --region $AWS_REGION \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

## 6. Build the app and upload artifacts

```bash
cd minichatbotagent
npm run build   # builds server, admin, widget

aws s3 sync apps/admin/dist s3://$STATIC_BUCKET/ --region $AWS_REGION
aws s3 cp apps/widget/dist/widget.js s3://$STATIC_BUCKET/widget.js --region $AWS_REGION --content-type "application/javascript"
```

> **Important**: `apps/admin` must be built with `VITE_API_BASE_URL` pointed at the **live** URL, not your local `.env`'s `localhost:4001`. See [`redeploy.md`](redeploy.md) for the exact command — don't skip this, it's a top cause of a "Failed to fetch" admin dashboard (see [`troubleshooting.md`](../troubleshooting.md)).

Package the server as a **source-only** artifact (no `node_modules` — npm workspace hoisting makes bundling `node_modules` from `apps/server` unreliable on Windows; let the EC2 instance run its own `npm install` instead):

```bash
mkdir -p /tmp/mcb-artifact
cp -r apps/server/dist apps/server/db /tmp/mcb-artifact/
mkdir -p /tmp/mcb-artifact/scripts
cp apps/server/scripts/run-migrations.mjs /tmp/mcb-artifact/scripts/
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('apps/server/package.json', 'utf8'));
delete pkg.devDependencies;
fs.writeFileSync('/tmp/mcb-artifact/package.json', JSON.stringify(pkg, null, 2));
"
tar czf /tmp/mcb-server.tar.gz -C /tmp/mcb-artifact .
aws s3 cp /tmp/mcb-server.tar.gz s3://$ARTIFACT_BUCKET/mcb-server-v1.tar.gz --region $AWS_REGION
```

## 7. Secrets Manager

```bash
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
GEMINI_KEY="paste-your-real-gemini-key-here"   # or leave "" and add later

aws secretsmanager create-secret --name mcb/app-env --region $AWS_REGION --secret-string "$(node -e "
console.log(JSON.stringify({
  ADMIN_JWT_SECRET: process.argv[1],
  DB_PASSWORD: process.argv[2],
  GEMINI_API_KEY: process.argv[3],
  SARVAM_API_KEY: ''
}))
" "$JWT_SECRET" "$DB_PASSWORD" "$GEMINI_KEY")"

APP_SECRET_ARN=$(aws secretsmanager describe-secret --secret-id mcb/app-env --region $AWS_REGION --query 'ARN' --output text)
```

> On Windows Git Bash, prefer writing the secret JSON to a temp file and passing `--secret-string file://...` (with a `C:/...` forward-slash path, not `/c/...`) — inline JSON with embedded quotes is fragile across shells. See [`troubleshooting.md`](../troubleshooting.md#windows--git-bash-path-gotchas).

## 8. IAM role for EC2

```bash
cat > /tmp/ec2-trust.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
EOF
aws iam create-role --role-name mcb-ec2-role --assume-role-policy-document file:///tmp/ec2-trust.json

cat > /tmp/ec2-policy.json <<EOF
{"Version":"2012-10-17","Statement":[
  {"Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":"$APP_SECRET_ARN"},
  {"Effect":"Allow","Action":["s3:GetObject"],"Resource":"arn:aws:s3:::$ARTIFACT_BUCKET/*"}
]}
EOF
aws iam put-role-policy --role-name mcb-ec2-role --policy-name mcb-ec2-access --policy-document file:///tmp/ec2-policy.json
aws iam attach-role-policy --role-name mcb-ec2-role --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

aws iam create-instance-profile --instance-profile-name mcb-ec2-profile
aws iam add-role-to-instance-profile --instance-profile-name mcb-ec2-profile --role-name mcb-ec2-role
```

`AmazonSSMManagedInstanceCore` is what lets you reach an instance via SSM Session Manager / Run Command with **no open SSH port**.

## 9. ALB + Target Group

```bash
TG_ARN=$(aws elbv2 create-target-group --name mcb-app-tg --protocol HTTP --port 4000 \
  --vpc-id $VPC_ID --target-type instance \
  --health-check-path /api/health --health-check-interval-seconds 15 \
  --healthy-threshold-count 2 --unhealthy-threshold-count 3 \
  --region $AWS_REGION --query 'TargetGroups[0].TargetGroupArn' --output text)

ALB_ARN=$(aws elbv2 create-load-balancer --name mcb-alb \
  --subnets $PUB_SUB1 $PUB_SUB2 --security-groups $ALB_SG \
  --scheme internet-facing --type application \
  --region $AWS_REGION --query 'LoadBalancers[0].LoadBalancerArn' --output text)
ALB_DNS=$(aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN --region $AWS_REGION --query 'LoadBalancers[0].DNSName' --output text)

aws elbv2 create-listener --load-balancer-arn $ALB_ARN --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN --region $AWS_REGION
```

## 10. Launch Template (the EC2 boot script)

The boot script (`user-data.sh`) does everything a fresh instance needs: installs Node 20 + nginx-not-needed-here (nginx was planned but the ALB talks to the app directly on 4000, so it's not actually required) + pm2, pulls the server artifact from S3, fetches secrets, writes `.env`, installs dependencies, and starts the app under pm2.

```bash
#!/bin/bash
set -e
exec > /var/log/mcb-bootstrap.log 2>&1

dnf install -y jq
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs   # must be v20+, NOT the AL2023 default "nodejs20" package (see ../troubleshooting.md)
npm install -g pm2

mkdir -p /opt/mcb && cd /opt/mcb
aws s3 cp s3://<ARTIFACT_BUCKET>/mcb-server-v1.tar.gz /opt/mcb/artifact.tar.gz --region <REGION>
tar xzf artifact.tar.gz

SECRET=$(aws secretsmanager get-secret-value --secret-id mcb/app-env --region <REGION> --query SecretString --output text)
ADMIN_JWT_SECRET=$(echo "$SECRET" | jq -r .ADMIN_JWT_SECRET)
DB_PASSWORD=$(echo "$SECRET" | jq -r .DB_PASSWORD)
GEMINI_API_KEY=$(echo "$SECRET" | jq -r .GEMINI_API_KEY)
SARVAM_API_KEY=$(echo "$SECRET" | jq -r .SARVAM_API_KEY)

cat > /opt/mcb/.env <<ENVEOF
PORT=4000
NODE_ENV=production
ALLOWED_ORIGINS=*
ADMIN_ORIGINS=*
DATABASE_URL=postgresql://mcbadmin:${DB_PASSWORD}@<RDS_ENDPOINT>:5432/minichatbot
DATABASE_SSL=true
ADMIN_JWT_SECRET=${ADMIN_JWT_SECRET}
ADMIN_JWT_EXPIRES_IN=7d
REDIS_URL=redis://<REDIS_ENDPOINT>:6379
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

Replace the `<ARTIFACT_BUCKET>`, `<REGION>`, `<RDS_ENDPOINT>`, `<REDIS_ENDPOINT>` placeholders with real values (`sed` them in, same as during the original build), then:

```bash
AMI_ID=$(aws ssm get-parameters --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 --region $AWS_REGION --query 'Parameters[0].Value' --output text)
USERDATA_B64=$(base64 -w0 user-data-final.sh)

cat > /tmp/lt-data.json <<EOF
{
  "ImageId": "$AMI_ID",
  "InstanceType": "t3.micro",
  "IamInstanceProfile": {"Name": "mcb-ec2-profile"},
  "SecurityGroupIds": ["$EC2_SG"],
  "UserData": "$USERDATA_B64"
}
EOF

LT_ID=$(aws ec2 create-launch-template --launch-template-name mcb-app-lt \
  --launch-template-data file:///tmp/lt-data.json \
  --region $AWS_REGION --query 'LaunchTemplate.LaunchTemplateId' --output text)
```

## 11. Auto Scaling Group

```bash
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name mcb-asg \
  --launch-template LaunchTemplateId=$LT_ID,Version='$Latest' \
  --min-size 1 --max-size 6 --desired-capacity 1 \
  --vpc-zone-identifier "$PRIV_SUB1,$PRIV_SUB2" \
  --target-group-arns $TG_ARN \
  --health-check-type ELB --health-check-grace-period 180 \
  --region $AWS_REGION

aws autoscaling put-scaling-policy \
  --auto-scaling-group-name mcb-asg --policy-name mcb-cpu-target-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{"PredefinedMetricSpecification":{"PredefinedMetricType":"ASGAverageCPUUtilization"},"TargetValue":60.0}' \
  --region $AWS_REGION
```

## 12. Run the database migration

The new instance is inside the VPC and can reach RDS directly; your own machine can't (RDS is private). Use SSM Run Command to execute the migration **on the instance**, using the `.env` its boot script already wrote:

```bash
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names mcb-asg --region $AWS_REGION --query 'AutoScalingGroups[0].Instances[0].InstanceId' --output text)
aws ssm wait  # (no built-in wait for SSM registration; poll describe-instance-information until PingStatus=Online)

CMD_ID=$(aws ssm send-command --instance-ids $INSTANCE_ID --document-name "AWS-RunShellScript" \
  --parameters 'commands=["cd /opt/mcb && node scripts/run-migrations.mjs"]' \
  --region $AWS_REGION --query 'Command.CommandId' --output text)
aws ssm get-command-invocation --command-id $CMD_ID --instance-id $INSTANCE_ID --region $AWS_REGION
```

> On Windows, set `export PYTHONUTF8=1` before this command — the migration script prints a Unicode `ℹ` character that otherwise crashes the AWS CLI's console output on Windows' default codepage. See [`troubleshooting.md`](../troubleshooting.md).

## 13. Create an admin account

```bash
CMD_ID=$(aws ssm send-command --instance-ids $INSTANCE_ID --document-name "AWS-RunShellScript" \
  --parameters 'commands=["cd /opt/mcb && node dist/scripts/createAdmin.js --email=you@example.com --password=YourSecurePassword123"]' \
  --region $AWS_REGION --query 'Command.CommandId' --output text)
```

## 14. CloudFront + S3 bucket policy

```bash
OAC_ID=$(aws cloudfront create-origin-access-control --origin-access-control-config \
  "Name=mcb-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
  --query 'OriginAccessControl.Id' --output text)
```

Build a distribution config JSON with two origins (S3 for static, the ALB for `/api/*`). Key fields:
- `DefaultRootObject: "index.html"`
- Default cache behavior → S3 origin
- A `/api/*` cache behavior → ALB origin, `OriginProtocolPolicy: "http-only"`, methods including POST/PUT/PATCH/DELETE

```bash
CF_ID=$(aws cloudfront create-distribution --distribution-config file:///tmp/cf-config.json --query 'Distribution.Id' --output text)
CF_DOMAIN=$(aws cloudfront get-distribution --id $CF_ID --query 'Distribution.DomainName' --output text)
CF_ARN=$(aws cloudfront get-distribution --id $CF_ID --query 'Distribution.ARN' --output text)

cat > /tmp/bucket-policy.json <<EOF
{"Version":"2012-10-17","Statement":[{
  "Sid":"AllowCloudFrontServicePrincipal","Effect":"Allow",
  "Principal":{"Service":"cloudfront.amazonaws.com"},
  "Action":"s3:GetObject","Resource":"arn:aws:s3:::$STATIC_BUCKET/*",
  "Condition":{"StringEquals":{"AWS:SourceArn":"$CF_ARN"}}
}]}
EOF
aws s3api put-bucket-policy --bucket $STATIC_BUCKET --policy file:///tmp/bucket-policy.json --region $AWS_REGION

aws cloudfront wait distribution-deployed --id $CF_ID   # 5-15 minutes
```

## 15. Verify

```bash
curl -I https://$CF_DOMAIN/                 # 200, admin SPA
curl -I https://$CF_DOMAIN/widget.js        # 200, application/javascript
curl https://$CF_DOMAIN/api/health          # {"ok":true}
curl -X POST https://$CF_DOMAIN/api/chat -H "Content-Type: application/json" \
  -d '{"sessionId":"verify","message":"hello"}'   # a real answer, not an error
```

Then log into the admin dashboard and confirm the LLM provider is actually set correctly (a fresh database defaults it — see [`troubleshooting.md`](../troubleshooting.md)).

---

## Accessing an instance

No SSH port is open. Use SSM instead, from any machine authenticated to your AWS account:

```bash
# Run a one-off command:
aws ssm send-command --instance-ids <id> --document-name "AWS-RunShellScript" \
  --parameters 'commands=["pm2 status"]' --region us-east-1

# Or an interactive shell (needs the Session Manager plugin installed locally):
aws ssm start-session --target <id> --region us-east-1
```
