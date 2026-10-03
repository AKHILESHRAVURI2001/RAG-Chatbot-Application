# AWS Console — Click-Through Setup

This is a **third, independent way** to build the exact same architecture described in [`../README.md`](../README.md) — this time entirely by clicking through the AWS web Console in your browser, with no command line at all. Good for actually *seeing* every setting as you set it, which is the fastest way to build real intuition for what each piece is.

This produces the same resources as [`../aws-cli/`](../aws-cli/README.md) (commands) and [`../terraform/`](../terraform/README.md) (code) — **pick one path, don't mix them**. If you've already built the stack one way, don't also click through this guide — you'd end up with two separate, both-billed copies.

## What to do first

1. **Have these ready before you start**: an AWS account you can create resources in, and this repo checked out locally (you'll build the app from it in step 10).
2. **Set your region to `us-east-1`** in the Console (top-right dropdown) before touching anything — every step below assumes this.
3. **Go in order.** Each step below depends on resources the previous one created — skipping ahead means a dropdown will be empty or a setting won't make sense yet.
4. **Budget about 1-2 hours** your first time through, mostly waiting on RDS (10-15 min) and CloudFront (5-15 min) to finish provisioning — not because there's a lot of clicking.

## The 13 steps, in order

| # | Step | What it creates |
|---|---|---|
| 1 | [VPC and Networking](01-vpc-networking.md) | The private network everything else lives inside |
| 2 | [Security Groups](02-security-groups.md) | The firewall rules between each layer |
| 3 | [RDS PostgreSQL Database](03-rds.md) | The database |
| 4 | [ElastiCache (Redis)](04-elasticache.md) | The shared cache |
| 5 | [S3 Buckets](05-s3.md) | Where built files and packaged code get uploaded |
| 6 | [IAM Role for the App Servers](06-iam.md) | What an app server is allowed to do |
| 7 | [Secrets Manager](07-secrets-manager.md) | Where passwords/API keys actually live |
| 8 | [Application Load Balancer](08-load-balancer.md) | The public front door for the API |
| 9 | [Launch Template + Auto Scaling Group](09-launch-template-asg.md) | The app servers themselves |
| 10 | [Build and Upload the App Code](10-build-and-upload-code.md) | Getting your actual code onto the infrastructure above |
| 11 | [Getting Onto an Instance](11-access-instance.md) | Running migrations, creating the first admin login |
| 12 | [CloudFront](12-cloudfront.md) | The one public URL for the whole app |
| 13 | [Verify Everything Works](13-verify.md) | Confirming it's actually live, end to end — plus what to do next |

Each page ends with a **✅ Checkpoint** (what should be true before moving on) and a **Next →** link, so you always know where you are and what's left.

## If you get stuck

[`../troubleshooting.md`](../troubleshooting.md) covers every real bug hit building this the first time — check there before assuming something's uniquely wrong with your attempt. It's referenced from the specific steps where each bug is likely to show up.
