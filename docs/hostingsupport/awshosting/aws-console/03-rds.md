# 3. RDS PostgreSQL Database

← [Back to overview](README.md) | **You are here: Step 3 of 13** | ← Previous: [2. Security Groups](02-security-groups.md)

Search for the **RDS** service.

## 3.1 Subnet group (do this first)
Left sidebar → **Subnet groups** → **Create DB subnet group**.
- Name: `mcb-db-subnets`
- VPC: `mcb-vpc`
- Availability Zones: select both `us-east-1a` and `us-east-1b`
- Subnets: select `mcb-private-1` and `mcb-private-2`
- **Create**

## 3.2 The database itself
Left sidebar → **Databases** → **Create database**.
- **Choose a database creation method**: Standard create
- **Engine type**: PostgreSQL, version **16.4** (or the latest 16.x offered)
- **Templates**: Free tier (or Production, if your account isn't free-tier-restricted and you want more options available)
- **DB instance identifier**: `mcb-postgres`
- **Master username**: `mcbadmin`
- **Credentials management**: let RDS auto-generate the password, or set one yourself — either way, **write it down somewhere safe**, you'll need it later.
- **DB instance class**: `db.t4g.micro`
- **Storage**: General Purpose SSD (gp3), 20 GiB
- **Multi-AZ deployment**: choose the Multi-AZ option (this is what gives automatic failover)
- **Connectivity → Virtual private cloud (VPC)**: `mcb-vpc`
- **DB subnet group**: `mcb-db-subnets`
- **Public access**: **No** (this is important — it must never be publicly reachable)
- **VPC security group**: choose existing → `mcb-rds-sg` (remove the default one if it's also selected)
- **Additional configuration** → **Initial database name**: `minichatbot`
- **Backup retention period**: **1 day** if your account shows a free-tier restriction warning for anything higher (this genuinely happened building the original deployment — see [`../troubleshooting.md`](../troubleshooting.md))
- **Create database**

This takes **10-15 minutes** to become "Available" (Multi-AZ takes longer than a single instance would). While you wait, you can move on and come back — nothing later strictly needs the database to be ready yet except the instance boot script (step 9) and the migration/verification steps (11, 13).

## ✅ Checkpoint before moving on
- Status shows **Available**
- Copy its **Endpoint** (Databases → `mcb-postgres` → Connectivity & security tab) — looks like `mcb-postgres.xxxxx.us-east-1.rds.amazonaws.com`. You'll need this in step 9.
- Confirm **Public access** is **No**

---
**Next →** [4. ElastiCache (Redis)](04-elasticache.md)
