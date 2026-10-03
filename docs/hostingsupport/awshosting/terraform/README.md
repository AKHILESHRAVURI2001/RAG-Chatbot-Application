# Terraform — This Same AWS Setup, as Code

## What is Terraform, in plain terms?

Everything in [`manual-setup.md`](../aws-cli/manual-setup.md) was built by typing `aws` CLI commands one at a time, by hand. That works, but it has real downsides: nothing writes itself down in one place, there's no easy way to see "what exists right now" without hunting through the AWS Console, and recreating it (a second environment, a disaster-recovery redo) means retyping every command again, carefully, in the right order.

**Terraform solves this by describing the *end state* you want, as code, in files like the ones in this folder** — "there should be a VPC with these subnets, a database with these settings, a load balancer pointing at this target group" — and then figuring out *for you* what AWS API calls are needed to make that true. Run it again later, after changing a number in one of these files, and Terraform only changes what actually needs to change — it doesn't recreate everything from scratch.

The files in this folder describe **exactly the same architecture** already explained in [`../README.md`](../README.md) — same VPC layout, same ALB + Auto Scaling Group, same RDS + Redis, same CloudFront + S3. Nothing new to learn about the *architecture* — this is the same design, written in a different, repeatable form.

## ⚠️ Before you run anything

**This is a second, independent copy of the infrastructure — not a way to "manage" the one already running.** A setup built by hand with the AWS CLI (see [`../aws-cli/`](../aws-cli/README.md)) is a separate thing. If you run `terraform apply` here, it will create a **brand new, separate** VPC, database, load balancer, etc. — with a different S3 bucket name (a random suffix is added automatically so it can't collide with the existing one) — and you'll be paying for *both* until you tear one down.

Use this folder for one of:
- **Learning** — read the files, run `terraform plan` (see below; this only *shows* what would happen, it changes nothing) to see how the pieces connect.
- **A second environment** — e.g. a `staging` copy, separate from the hand-built one.
- **Eventually replacing the hand-built one** — possible via `terraform import` (telling Terraform "this AWS resource that already exists is now yours to manage"), but that's an intermediate/advanced Terraform skill not covered here. Ask if you want to attempt it once you're comfortable with the basics below.

## Prerequisites

- [Terraform installed](https://developer.hashicorp.com/terraform/install) (v1.6 or newer — check with `terraform version`)
- Signed in to AWS (`aws login`, same as everywhere else in this repo)

## The four commands you actually need

Terraform's entire day-to-day workflow is four commands, always run from this folder:

| Command | What it does | Safe to run anytime? |
|---|---|---|
| `terraform init` | Downloads the AWS/random plugins these files need. Run this once, and again any time you pull changes to these files from someone else. | Yes — never changes any AWS resource |
| `terraform plan` | Shows you a preview: "this would create 40 resources / change 2 / destroy 0" — without actually doing any of it. | Yes — read-only, changes nothing |
| `terraform apply` | Actually creates/changes the AWS resources, after showing you the same preview and asking "yes, do this?" | **No** — this spends real money and creates real infrastructure. Read the plan output before typing `yes`. |
| `terraform destroy` | Tears down every resource this configuration created. | **No** — this deletes real, possibly-still-needed infrastructure. Double-check you mean the copy you think you mean. |

## Step by step

```bash
cd docs/hostingsupport/awshosting/terraform

# 1. Set up your inputs (this file holds your real API keys — never commit it, see .gitignore)
cp terraform.tfvars.example terraform.tfvars
# now edit terraform.tfvars and paste in your real Gemini API key etc.

# 2. Download the plugins
terraform init

# 3. Preview what would be created
terraform plan

# 4. Actually create it (asks for confirmation before doing anything)
terraform apply
```

`terraform apply` takes roughly 15-20 minutes — most of that is genuinely waiting on AWS (RDS Multi-AZ setup and the CloudFront distribution both take several minutes on AWS's side no matter how they're created, CLI or Terraform).

When it finishes, it prints the **outputs** (see [`outputs.tf`](outputs.tf)) — the live URL, database endpoint, bucket names, etc. Run `terraform output` any time afterward to see them again.

## What Terraform does *not* do for you

Terraform's job is the **infrastructure** — the VPC, the database, the load balancer, the empty app servers waiting to run something. It deliberately does **not**:

- Build your application code (`npm run build`)
- Upload the built server/admin/widget files
- Run the database migration
- Create the first admin login

Those are **application deployment** steps, not infrastructure steps — a genuinely different job in real DevOps practice, which is why they're kept separate here rather than jammed into the same tool. After `terraform apply` finishes, follow [`aws-cli/manual-setup.md`](../aws-cli/manual-setup.md) starting from **step 6 (build and upload artifacts)** onward, using the bucket names and endpoints Terraform just printed as outputs.

## Making a change later

Edit the relevant `.tf` file (say, `variables.tf` to bump `asg_max_size` from 6 to 10), then:

```bash
terraform plan    # confirms it will change only what you expect
terraform apply   # applies just that change
```

This is the real payoff of "infrastructure as code": the change is a one-line diff in a file, reviewable like any other code change, instead of a manually-run `aws` command that leaves no trace of what was changed or why.

## Tearing it down

```bash
terraform destroy
```

Only do this for a copy you're sure you want gone — it deletes the database too (data loss, unless you'd already exported anything worth keeping).
