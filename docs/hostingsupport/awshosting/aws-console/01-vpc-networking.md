# 1. VPC and Networking

← [Back to overview](README.md) | **You are here: Step 1 of 13**

Go to the **VPC** service (search "VPC" in the top search bar).

> **Set your region first, every time.** Top-right corner of the Console, next to your account name, there's a region dropdown (it might say "N. Virginia" or similar). Set it to **US East (N. Virginia) us-east-1** and leave it there for every step in this guide — creating something in the wrong region is the single most common beginner mistake, since resources are invisible from any other region's view.

## 1.1 Create the VPC
1. Left sidebar → **Your VPCs** → **Create VPC**.
2. Choose **VPC only** (not the "VPC and more" wizard — we want to see each piece).
3. **Name tag**: `mcb-vpc`
4. **IPv4 CIDR block**: `10.42.0.0/16`
5. Leave everything else default → **Create VPC**.

## 1.2 Create the subnets
Left sidebar → **Subnets** → **Create subnet**, four times, once for each row:

| Name | VPC | Availability Zone | IPv4 CIDR block |
|---|---|---|---|
| `mcb-public-1` | mcb-vpc | us-east-1a | `10.42.0.0/20` |
| `mcb-public-2` | mcb-vpc | us-east-1b | `10.42.16.0/20` |
| `mcb-private-1` | mcb-vpc | us-east-1a | `10.42.32.0/20` |
| `mcb-private-2` | mcb-vpc | us-east-1b | `10.42.48.0/20` |

(You can actually add all 4 as "additional subnet settings" rows in a single **Create subnet** flow if it offers that — same result either way.)

After creating the two public subnets, select each one → **Actions → Edit subnet settings** → check **Enable auto-assign public IPv4 address** → **Save**. (Skip this for the two private subnets — they should *not* get public IPs.)

## 1.3 Internet Gateway
1. Left sidebar → **Internet gateways** → **Create internet gateway**.
2. Name: `mcb-igw` → **Create**.
3. Select it → **Actions → Attach to VPC** → choose `mcb-vpc` → **Attach**.

## 1.4 NAT Gateway
This lets the private subnets (where the app servers, database, and cache live) reach the internet for things like software updates — but never the other way around.

1. Left sidebar → **NAT gateways** → **Create NAT gateway**.
2. Name: `mcb-nat`
3. **Subnet**: `mcb-public-1` (a NAT Gateway must sit in a *public* subnet)
4. **Connectivity type**: Public
5. **Elastic IP allocation ID** → click **Allocate Elastic IP** (this gets it a fixed public address) → **Create NAT gateway**.
6. Wait for its status to become **Available** (takes a couple of minutes) before continuing.

## 1.5 Route tables
Left sidebar → **Route tables**.

**Public route table:**
1. **Create route table** → Name: `mcb-public-rt`, VPC: `mcb-vpc` → **Create**.
2. Select it → **Routes** tab → **Edit routes** → **Add route** → Destination `0.0.0.0/0`, Target: **Internet Gateway** → `mcb-igw` → **Save changes**.
3. **Subnet associations** tab → **Edit subnet associations** → check `mcb-public-1` and `mcb-public-2` → **Save associations**.

**Private route table:**
1. **Create route table** → Name: `mcb-private-rt`, VPC: `mcb-vpc` → **Create**.
2. **Routes** tab → **Edit routes** → **Add route** → Destination `0.0.0.0/0`, Target: **NAT Gateway** → `mcb-nat` → **Save changes**.
3. **Subnet associations** tab → check `mcb-private-1` and `mcb-private-2` → **Save associations**.

## ✅ Checkpoint before moving on
- VPC `mcb-vpc` exists
- 4 subnets exist (2 public with auto-assign IP on, 2 private without)
- NAT Gateway status is **Available**
- Both route tables have their routes and subnet associations set

---
**Next →** [2. Security Groups](02-security-groups.md)
