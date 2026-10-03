# AWS Hosting — Start Here

This folder is a **reference guide for running MiniChatbotAgent on AWS** — the servers, database and network your app needs in production. If you're new to DevOps/cloud hosting, this page is written for you: it explains not just *what* was built, but *why*, in plain language, before pointing you at the more detailed files.

When you finish, you will have:

- **The app:** `https://YOUR-CLOUDFRONT-DOMAIN.cloudfront.net`
- **The admin dashboard:** `https://YOUR-CLOUDFRONT-DOMAIN.cloudfront.net/admin/`
- **The widget script:** `https://YOUR-CLOUDFRONT-DOMAIN.cloudfront.net/widget.js`
- **AWS region:** the guides use `us-east-1` (a data center location in Virginia, USA). You can use another region — change it everywhere the guides mention it.

## What "hosting" actually means here

Your app has three parts that all need somewhere to run:
1. **The server** (`apps/server`) — the Node.js/Express program that answers chat questions, talks to the database, calls the AI provider. This needs an actual computer running 24/7.
2. **The admin dashboard** (`apps/admin`) — a website (just HTML/CSS/JS files, no server-side code) for managing settings, documents, FAQs.
3. **The widget** (`apps/widget`) — a single JavaScript file (`widget.js`) that customer websites embed to show the chat bubble.

"Hosting on AWS" means: AWS rents you the computers, storage, and networking to run all three, and you (or, here, Terraform / the AWS CLI) configure exactly how they're wired together. Everything below is that configuration.

## Folder layout

This folder has **three independent, separate ways to build the same architecture** (plus a fourth, different architecture using containers) — don't mix commands between them:

```
awshosting/
├── README.md              <- this file: the big picture
├── troubleshooting.md     <- shared: bugs + fixes that apply across all paths
├── aws-cli/                <- Path A: build it by hand, typing aws CLI commands
│   ├── manual-setup.md
│   └── redeploy.md
├── aws-console/             <- Path B: build it by clicking through the AWS web Console
│   ├── README.md            <- index of all 13 numbered steps
│   └── 01-vpc-networking.md ... 13-verify.md
├── terraform/               <- Path C: the same architecture, as reusable Terraform code
│   ├── README.md
│   └── *.tf
└── pipeline/                    <- A different, container-based architecture + automated pipelines
    ├── README.md
    ├── jenkins.md
    ├── ecs.md
    └── eks.md
```

## Read these in this order

1. **This file** — the big picture, in plain English.
2. [`aws-console/`](aws-console/README.md) — **Path B**: build it by clicking through the AWS Console in your browser, no command line at all. The best starting point if you've never used AWS before — you *see* every setting as you set it.
3. [`aws-cli/`](aws-cli/README.md) — **Path A**: how the setup is built, one `aws` CLI command at a time, with the reasoning for each step. Same result as the Console path, faster once you're comfortable with the ideas.
4. [`terraform/`](terraform/README.md) — **Path C**: the same architecture, written as reusable Terraform code instead of one-off commands or clicks. Read this once the Console/CLI steps make sense — it's the same ideas, in the form real DevOps teams use day to day.
5. [`pipeline/`](pipeline/README.md) — a **different architecture**: the app packaged as Docker containers, deployed via ECS or EKS, with Jenkins automating the whole build-and-ship pipeline. Read this once the EC2-based paths above make sense — it introduces genuinely new concepts (containers, orchestration, pipelines) on top of everything here.
6. [`troubleshooting.md`](troubleshooting.md) — every real bug hit while building this, and its fix. Shared across paths. Keep this open while you work; you will likely hit one of these.

---

## Glossary — every AWS term used in this folder, in plain English

If a term below shows up later and you've forgotten what it means, come back here.

| Term | Plain-English meaning |
|---|---|
| **VPC** (Virtual Private Cloud) | Your own private, isolated network inside AWS. Nothing in it is reachable from the internet unless you explicitly allow it. |
| **Subnet** | A smaller slice of a VPC's address range. This app uses 4: 2 "public" (the load balancer lives here, has an internet-facing address) and 2 "private" (the app servers/database/cache live here, with no direct internet access). |
| **Availability Zone (AZ)** | A physically separate AWS data center within a region. Spreading resources across 2 AZs means one data center having a problem doesn't take the whole app down. |
| **Internet Gateway** | The "door" that lets a VPC talk to the public internet at all. |
| **NAT Gateway** | Lets things in *private* subnets reach the internet outbound (e.g. to run `npm install`) **without** being reachable *from* the internet — one-way only. |
| **Security Group** | A firewall: a list of rules for exactly which other things are allowed to connect to a given resource, on which port. This app's rule is strict: the database, for example, only accepts connections from the app servers — never directly from the internet. |
| **EC2** (Elastic Compute Cloud) | An actual virtual computer ("instance") that AWS rents you. This app's EC2 instances run **Linux** (specifically Amazon Linux 2023) — there is no Windows anywhere in this deployment. |
| **AMI** (Amazon Machine Image) | The template/snapshot an EC2 instance boots from — like a hard drive image with the OS pre-installed. |
| **Launch Template** | The reusable "recipe" for creating one EC2 instance — which AMI, what size, and a boot script to run automatically the moment it starts. |
| **Auto Scaling Group (ASG)** | Keeps a target number of EC2 instances running automatically — launches more under load (using the Launch Template above), replaces any that crash, without a human involved. |
| **Application Load Balancer (ALB)** | The single public "front door." Spreads incoming requests across however many EC2 instances currently exist, and continuously checks each one is actually healthy. |
| **RDS** (Relational Database Service) | AWS's managed database — here, PostgreSQL. "Managed" means AWS handles patching and backups for you. |
| **Multi-AZ** (as applied to RDS) | A live, automatically-updated standby copy of the database in a second data center, which the app fails over to automatically if the primary has a problem. |
| **ElastiCache** | AWS's managed version of Redis (an in-memory cache), used here to cache repeated question/answer pairs so every app server shares one consistent cache instead of each keeping its own. |
| **S3** (Simple Storage Service) | AWS's file storage service. Used here for two jobs: hosting the built admin dashboard + widget.js as static files, and holding the packaged server code for app servers to download. |
| **CloudFront** | AWS's CDN (Content Delivery Network) — caches static files at locations physically close to visitors worldwide, so pages load fast anywhere, and static traffic never has to reach the app servers at all. |
| **IAM** (Identity and Access Management) | Controls *who/what* can do *what* in your AWS account. Here, it's what lets an EC2 instance read one specific secret and one specific S3 bucket — and nothing else. |
| **Secrets Manager** | Where passwords and API keys actually live — not hardcoded anywhere in the server setup, fetched at boot time instead. |
| **Terraform** | A tool for describing infrastructure as code — files that say "there should be a VPC, a database, ..." — instead of typing one-off commands. See [`terraform/README.md`](terraform/README.md). |

---

## Architecture

```
Users ──▶ CloudFront ──┬──▶ S3 (static): admin dashboard (built SPA) + widget.js
                        └──▶ /api/* ──▶ ALB (public subnets)
                                          └──▶ Auto Scaling Group of EC2 instances (private subnets, 2 AZs)
                                                  Linux (Amazon Linux 2023), running Node/Express (apps/server) via pm2
                                                      │
                                            ┌─────────┴──────────┐
                                            ▼                    ▼
                                    RDS PostgreSQL          ElastiCache Redis
                                    (Multi-AZ, private)     (shared cache, private)
```

Every EC2 instance in the Auto Scaling Group is a **Linux** server (Amazon Linux 2023) — nothing in this deployment runs on Windows. The boot script that sets one up (see [`manual-setup.md`](aws-cli/manual-setup.md#10-launch-template-the-ec2-boot-script) or [`terraform/user_data.sh.tftpl`](terraform/user_data.sh.tftpl)) is a Bash shell script for exactly that reason.

### Why each piece exists

| Piece | Why it's there |
|---|---|
| **CloudFront + S3** | Serves the admin dashboard and `widget.js` — the highest-volume, most cacheable traffic — straight from the CDN edge. This traffic never touches the app servers at all, which is the single biggest lever for handling more people without more compute cost. |
| **ALB + Auto Scaling Group** | The app runs on EC2 instances that scale out automatically under load (CPU target-tracking, currently min 1 / max 6). A single box has a hard ceiling and no self-healing on crash; this doesn't. |
| **RDS Multi-AZ** | Automatic failover if the primary database instance has a problem. This is what "production" mainly buys at the DB layer, independent of traffic volume. |
| **ElastiCache Redis** | The app's query/answer cache (`apps/server/src/cache/redis.ts`) already supports Redis with an in-memory fallback. With more than one app instance, each instance's in-memory cache would silently diverge — Redis makes the cache shared and correct across the whole fleet. No code change was needed for this, only pointing `REDIS_URL` at a real Redis instance. |
| **Secrets Manager** | Holds the app's `.env` values (JWT secret, DB password, LLM API key) and the RDS master credential — nothing sensitive is baked into the Launch Template or an AMI. |

### What's *not* here (known, deliberate gaps)

- **No RDS Proxy.** It was part of the original plan (pools DB connections across the EC2 fleet so connection count doesn't explode as instances scale out), but AWS accounts on a free-tier-restricted plan block it with a `FreeTierRestrictionError`. The guides connect to RDS directly. That is fine at small scale; add RDS Proxy once your account plan allows it — it's a config change (point `DATABASE_URL` at the new Proxy endpoint), not a rebuild.
- **No CI/CD.** Shipping a code change today is a manual rebuild + re-upload + instance refresh (see [`redeploy.md`](aws-cli/redeploy.md)). A pipeline (GitHub Actions, CodePipeline, etc.) is a natural next step.
- **No Docker/containers.** Deliberately kept off the table for this pass; EC2 + Auto Scaling Group was chosen specifically so this stays true while still being elastic.
- **No custom domain / HTTPS cert beyond CloudFront's default.** Using the AWS-generated `*.cloudfront.net` URL. Adding a domain later is a Route 53 + ACM certificate addition, not a re-architecture.
- **Voice (Sarvam/OpenAI speech) key is not configured.** It is left empty by default. Add it via Secrets Manager (`mcb/app-env` secret, `SARVAM_API_KEY` field) or directly in the admin's Settings page once you have a key.

---

## Three things that would trip you up if nobody told you

1. **The app was already written to support this.** No server-side session state (conversations are tracked by `sessionId` in the DB), and the cache layer already had a Redis path built in. That's *why* this could be a fleet of stateless EC2 instances behind a load balancer without any app-code changes.
2. **Static build output is baked with its target API URL at build time.** `apps/admin` reads `VITE_API_BASE_URL` from its `.env` at `vite build` time and inlines it into the compiled JS — it is *not* something you can change after the fact by moving the built files somewhere else. Every time the admin dashboard is rebuilt for this deployment, it must be built with `VITE_API_BASE_URL=https://YOUR-CLOUDFRONT-DOMAIN.cloudfront.net/api`, not whatever your local `.env` says. See [`redeploy.md`](aws-cli/redeploy.md).
3. **A fresh database has fresh (default) settings.** Migrating to a brand-new RDS instance runs the schema migrations, but the `settings` table's *values* (which LLM provider is selected, whether voice is enabled, etc.) start at their defaults, not whatever your local/Supabase database had configured via the admin UI. After first standing this up, go into the admin Settings and re-confirm: LLM provider + model, business hours, widget appearance, anything else you'd configured before.
