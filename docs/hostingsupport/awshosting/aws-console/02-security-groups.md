# 2. Security Groups

← [Back to overview](README.md) | **You are here: Step 2 of 13** | ← Previous: [1. VPC and Networking](01-vpc-networking.md)

Left sidebar (still in the VPC service) → **Security groups** → **Create security group**, four times:

**`mcb-alb-sg`** — description "ALB", VPC `mcb-vpc`.
- Inbound rule: Type **HTTP**, Source **Anywhere-IPv4** (`0.0.0.0/0`)

**`mcb-ec2-sg`** — description "App instances", VPC `mcb-vpc`.
- Inbound rule: Type **Custom TCP**, Port `4000`, Source: **Custom** → select the `mcb-alb-sg` security group (start typing its name/ID, it'll autocomplete)

**`mcb-rds-sg`** — description "RDS", VPC `mcb-vpc`.
- Inbound rule: Type **PostgreSQL** (auto-fills port 5432), Source: **Custom** → `mcb-ec2-sg`

**`mcb-cache-sg`** — description "ElastiCache", VPC `mcb-vpc`.
- Inbound rule: Type **Custom TCP**, Port `6379`, Source: **Custom** → `mcb-ec2-sg`

Leave outbound rules at their default (all traffic allowed out) for all four — that default is fine and is what every other path in this repo uses too.

Notice there's no rule anywhere opening port 22 (SSH). That's deliberate — see [11. Getting Onto an Instance](11-access-instance.md) for how you'll actually get onto an instance instead.

## ✅ Checkpoint before moving on
- 4 security groups exist: `mcb-alb-sg`, `mcb-ec2-sg`, `mcb-rds-sg`, `mcb-cache-sg`
- Each one's single inbound rule points at the *previous* layer's security group (not an IP range), except `mcb-alb-sg` which is intentionally open to the internet on port 80

---
**Next →** [3. RDS PostgreSQL Database](03-rds.md)
