# Shipping a Code Change

There's no CI/CD pipeline yet, so this is manual. It's the same handful of steps every time.

```bash
export AWS_REGION=us-east-1
export MSYS_NO_PATHCONV=1   # Windows Git Bash only — see ../troubleshooting.md
CF_DOMAIN=YOUR-CLOUDFRONT-DOMAIN.cloudfront.net
CF_ID=E1LBQSY8AXS8N8
ARTIFACT_BUCKET=mcb-deploy-artifacts-4b67cca1
STATIC_BUCKET=mcb-static-4b67cca1
```

## Server change (`apps/server`)

```bash
cd minichatbotagent/apps/server
npm run build

# Package as a source-only artifact (no node_modules — see manual-setup.md step 6)
rm -rf /tmp/mcb-artifact
mkdir -p /tmp/mcb-artifact
cp -r dist db /tmp/mcb-artifact/
mkdir -p /tmp/mcb-artifact/scripts
cp scripts/run-migrations.mjs /tmp/mcb-artifact/scripts/
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
delete pkg.devDependencies;
fs.writeFileSync('/tmp/mcb-artifact/package.json', JSON.stringify(pkg, null, 2));
"
tar czf /tmp/mcb-server.tar.gz -C /tmp/mcb-artifact .
aws s3 cp /tmp/mcb-server.tar.gz s3://$ARTIFACT_BUCKET/mcb-server-v1.tar.gz --region $AWS_REGION
```

Then get it onto the running instance(s). Two options:

**A. Fast path — patch the currently running instance(s) directly** (good for a quick fix, but any *new* instance the ASG launches later will also get this same artifact from S3, so this is not a hack — it's consistent):
```bash
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names mcb-asg --region $AWS_REGION --query 'AutoScalingGroups[0].Instances[].InstanceId' --output text)
for id in $INSTANCE_ID; do
  aws ssm send-command --instance-ids $id --document-name "AWS-RunShellScript" \
    --parameters "commands=[\"cd /opt/mcb && aws s3 cp s3://$ARTIFACT_BUCKET/mcb-server-v1.tar.gz /opt/mcb/artifact.tar.gz --region $AWS_REGION && tar xzf artifact.tar.gz && pm2 restart mcb-server\"]" \
    --region $AWS_REGION --query 'Command.CommandId' --output text
done
```

**B. Clean path — full instance refresh** (replaces every instance with a fresh boot from the Launch Template, which pulls the new artifact automatically; safer for bigger changes, takes a few minutes):
```bash
aws autoscaling start-instance-refresh --auto-scaling-group-name mcb-asg --region $AWS_REGION \
  --preferences MinHealthyPercentage=0,InstanceWarmup=180
```

If the change touched environment/config (new secret field, etc.), also update the `mcb/app-env` secret and either restart pm2 with the new `.env` values patched in (option A, plus re-write `/opt/mcb/.env`) or do a full refresh (option B, which re-runs the boot script and picks up the new secret automatically).

## Admin dashboard change (`apps/admin`)

**This one is different — read carefully.** `apps/admin` bakes `VITE_API_BASE_URL` into the compiled JS at build time. Your local `apps/admin/.env` has it set to `http://localhost:4001/api` for local dev. If you `npm run build` normally, the *deployed* admin dashboard will silently try to call `localhost:4001` from every visitor's browser — this actually happened once during initial setup (see [`troubleshooting.md`](../troubleshooting.md)).

Always override it at build time for a production build, and never touch the local `.env`:

```bash
cd minichatbotagent/apps/admin
VITE_API_BASE_URL="https://$CF_DOMAIN/api" npm run build

# Sanity check before deploying — should be 0:
grep -c "localhost:400" dist/assets/*.js || echo "clean"

aws s3 rm s3://$STATIC_BUCKET/assets --recursive --region $AWS_REGION
aws s3 sync dist s3://$STATIC_BUCKET/ --region $AWS_REGION --exclude "*" --include "index.html" --include "assets/*"
aws cloudfront create-invalidation --distribution-id $CF_ID --paths "/*" --region $AWS_REGION
```

## Widget change (`apps/widget`)

```bash
cd minichatbotagent/apps/widget
npm run build
aws s3 cp dist/widget.js s3://$STATIC_BUCKET/widget.js --region $AWS_REGION --content-type "application/javascript"
aws cloudfront create-invalidation --distribution-id $CF_ID --paths "/widget.js" --region $AWS_REGION
```

## Database migration (new `.sql` file added)

Same idea as the initial setup — run it *on an instance* (RDS is private, your own machine can't reach it directly):

```bash
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names mcb-asg --region $AWS_REGION --query 'AutoScalingGroups[0].Instances[0].InstanceId' --output text)
# Make sure the instance already has the updated artifact (which includes db/migrations/*.sql) — see server redeploy above — then:
aws ssm send-command --instance-ids $INSTANCE_ID --document-name "AWS-RunShellScript" \
  --parameters 'commands=["cd /opt/mcb && node scripts/run-migrations.mjs"]' \
  --region $AWS_REGION --query 'Command.CommandId' --output text
```

Migrations are idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`), so re-running the whole set is always safe.
