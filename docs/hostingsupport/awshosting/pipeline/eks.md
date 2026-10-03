# Deploying to EKS (Kubernetes)

Same containers as [`ecs.md`](ecs.md), same underlying idea (an orchestrator running your containers, scaling them, replacing crashed ones) — but using **Kubernetes** instead of ECS. Kubernetes isn't AWS-specific: everything in [`k8s/`](k8s/) is standard Kubernetes YAML that would work close to unchanged on any other cloud's Kubernetes service, or on a Kubernetes cluster running on your own hardware. EKS is just AWS's *managed* way to run a Kubernetes cluster, so you don't have to run the control plane yourself.

If you haven't read [`ecs.md`](ecs.md) yet, read it first — the "why containers" reasoning there isn't repeated here.

## Kubernetes vocabulary used in the manifests below

| Term | Plain-English meaning |
|---|---|
| **Cluster** | The whole set of machines Kubernetes manages, plus Kubernetes itself running on top of them. |
| **Pod** | The smallest unit Kubernetes runs — usually one container (here, always one: our server, admin, or widget container). |
| **Deployment** | "Keep N copies of this Pod running, and here's how to build one" — this is what actually creates and manages Pods. Equivalent to the Auto Scaling Group + Launch Template combined. |
| **Service** | A stable internal network address for a Deployment's Pods, even as individual Pods are replaced. Equivalent to a Target Group. |
| **Ingress** | The public "front door" rule — which URL paths go to which Service. Equivalent to the ALB + its listener rules / CloudFront's path-based origins. |
| **HorizontalPodAutoscaler (HPA)** | "Add more Pods when CPU usage is high" — equivalent to the ASG's target-tracking scaling policy. |
| **Secret** | Kubernetes's own way to store sensitive values and hand them to Pods as environment variables — equivalent to the Secrets Manager + IAM role combination in the EC2/ECS paths. |
| **Namespace** | A labeled subdivision of the cluster — this app's resources all live in one (`minichatbot`), separate from anything else that might run on the same cluster later. |

## 1. Create the EKS cluster

The `eksctl` tool (a dedicated CLI for EKS, separate from the general `aws` CLI) creates the cluster and all its supporting networking in one command:

```bash
eksctl create cluster \
  --name mcb-cluster \
  --region us-east-1 \
  --nodegroup-name mcb-nodes \
  --node-type t3.medium \
  --nodes 2 --nodes-min 1 --nodes-max 4 \
  --managed
```

This takes **15-20 minutes** — EKS provisions its own control plane, which is slower than anything else in this repo. `--managed` means AWS handles patching the worker nodes' OS for you (a "managed node group") — the closest EKS equivalent to Fargate's "don't think about servers," though EKS also supports pure Fargate pods if you want to go further than this guide does.

Once done, point `kubectl` (Kubernetes's own CLI) at it:
```bash
aws eks update-kubeconfig --name mcb-cluster --region us-east-1
kubectl get nodes   # should list your 2 worker machines
```

## 2. Push images to ECR

Same as [`ecs.md` step 1](ecs.md#1-push-images-to-ecr) — EKS pulls from the same ECR repositories, no difference here.

## 3. The database credential and app config, as a Kubernetes Secret

```bash
cp k8s/secrets-example.yaml k8s/secrets.yaml
# edit k8s/secrets.yaml with your real DATABASE_URL, ADMIN_JWT_SECRET, GEMINI_API_KEY

kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
```

> A real production setup would sync this from AWS Secrets Manager automatically instead (the **External Secrets Operator** is the standard tool for that), so the actual key value is never sitting in a YAML file on anyone's disk. That's a worthwhile next step once the basics here are working — not covered in depth here to keep this guide focused.

## 4. Install the AWS Load Balancer Controller

This is what turns the `Ingress` YAML (section 6) into a real ALB — it doesn't exist by default on a fresh EKS cluster.

```bash
eksctl utils associate-iam-oidc-provider --cluster mcb-cluster --region us-east-1 --approve

helm repo add eks https://aws.github.io/eks-charts
helm repo update
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=mcb-cluster \
  --set serviceAccount.create=true
```

(This uses **Helm**, Kubernetes's package manager — think of it like `npm install` but for installing whole pre-built pieces of cluster infrastructure like this controller, rather than writing all its YAML by hand.)

## 5. Deploy the app

Fill in your real ECR image URIs and Redis endpoint in [`k8s/server.yaml`](k8s/server.yaml) (replace `ACCOUNT_ID.dkr.ecr...` and `YOUR_REDIS_ENDPOINT`), then:

```bash
kubectl apply -f k8s/server.yaml
kubectl apply -f k8s/admin.yaml
kubectl apply -f k8s/widget.yaml

kubectl get pods -n minichatbot   # watch them go from Pending -> Running
```

## 6. Expose it publicly

```bash
kubectl apply -f k8s/ingress.yaml
kubectl get ingress -n minichatbot   # ADDRESS column fills in after a minute or two — that's your ALB's DNS name
```

Point CloudFront at that ALB address exactly as in the EC2 path (or add a Route 53 record directly to it) — the CDN-in-front-of-an-ALB pattern is identical regardless of what's actually running behind the ALB.

## Shipping a code change

```bash
docker build -f apps/server/Dockerfile -t ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/mcb-server:$(git rev-parse --short HEAD) .
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/mcb-server:$(git rev-parse --short HEAD)

kubectl set image deployment/mcb-server \
  mcb-server=ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/mcb-server:$(git rev-parse --short HEAD) \
  -n minichatbot

kubectl rollout status deployment/mcb-server -n minichatbot   # watch the rolling update happen live
```

`kubectl set image` triggers a **rolling update**: Kubernetes starts Pods with the new image, waits for each to pass its `readinessProbe` (see [`k8s/server.yaml`](k8s/server.yaml)), and only then removes an old one — the same "no downtime" guarantee as the ASG instance refresh and ECS's rolling deployment. See [`jenkins.md`](jenkins.md#where-this-fits-with-everything-else-in-this-repo) for wiring this exact command into an automated pipeline.

## Tearing it down

```bash
kubectl delete -f k8s/ingress.yaml   # do this first — it deletes the ALB, avoid leaving it billing after the cluster's gone
kubectl delete -f k8s/server.yaml -f k8s/admin.yaml -f k8s/widget.yaml -f k8s/secrets.yaml -f k8s/namespace.yaml
eksctl delete cluster --name mcb-cluster --region us-east-1
```
