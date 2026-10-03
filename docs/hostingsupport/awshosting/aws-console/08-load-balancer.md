# 8. Application Load Balancer

← [Back to overview](README.md) | **You are here: Step 8 of 13** | ← Previous: [7. Secrets Manager](07-secrets-manager.md)

Search for the **EC2** service (the ALB lives under EC2 → Load Balancing in the Console).

## 8.1 Target group (create this first, the load balancer needs it)
1. Left sidebar → **Target Groups** → **Create target group**.
2. **Target type**: Instances
3. **Name**: `mcb-app-tg`
4. **Protocol : Port**: HTTP : `4000`
5. **VPC**: `mcb-vpc`
6. **Health checks** → **Advanced health check settings** → **Health check path**: `/api/health`, interval 15 seconds, healthy threshold 2, unhealthy threshold 3.
7. **Next** → don't register any targets yet (the Auto Scaling Group will do that automatically later, in [step 9](09-launch-template-asg.md)) → **Create target group**.

## 8.2 The load balancer
1. Left sidebar → **Load Balancers** → **Create load balancer** → **Application Load Balancer**.
2. **Name**: `mcb-alb`
3. **Scheme**: Internet-facing
4. **VPC**: `mcb-vpc`
5. **Mappings**: select both Availability Zones, and for each pick its **public** subnet (`mcb-public-1` for us-east-1a, `mcb-public-2` for us-east-1b)
6. **Security groups**: select `mcb-alb-sg` (remove the default one)
7. **Listeners**: HTTP : 80 → **Forward to** → `mcb-app-tg`
8. **Create load balancer**

## ✅ Checkpoint before moving on
- Status shows **Active**
- Copy its **DNS name** (looks like `mcb-alb-xxxxx.us-east-1.elb.amazonaws.com`) — you can test with this directly (once step 9 is done) even before CloudFront exists

---
**Next →** [9. Launch Template + Auto Scaling Group](09-launch-template-asg.md)
