# CI/CD — Containers + Automated Pipelines

Everything in [`../aws-cli/`](../aws-cli/), [`../aws-console/`](../aws-console/), and [`../terraform/`](../terraform/) runs the app directly on EC2 virtual machines, and every code change is shipped by hand (rebuild → re-upload → restart — see [`../aws-cli/redeploy.md`](../aws-cli/redeploy.md)). This folder is a **different, more advanced architecture**: the app packaged as **Docker containers**, run by an orchestrator (**ECS** or **EKS**) instead of directly on a server, with **Jenkins** automating build-and-ship so a code change goes live without anyone typing deploy commands at all.

Read this after the EC2-based paths make sense — the concepts here (containers, orchestration, pipelines) build on top of everything already explained in [`../README.md`](../README.md), they don't replace it.

## What's new here, in plain English

| Term | Plain-English meaning |
|---|---|
| **Container** | A package that bundles your app's code together with everything it needs to run (Node.js itself, exact dependency versions, OS libraries) into one file. "It works on my machine" stops being a problem, because the container *is* the machine, wherever it runs. |
| **Docker** | The tool that builds containers (from a `Dockerfile` — a recipe for what goes inside) and runs them. |
| **Image** | A built container, ready to run — the actual file Docker produces from a `Dockerfile`. |
| **Container registry / ECR** | Where built images are stored so something else (ECS, EKS, another machine) can download and run them. ECR (Elastic Container Registry) is AWS's version, like a private GitHub for images instead of code. |
| **Orchestrator** | A system that runs many containers across many machines, restarts crashed ones, and scales the count up/down — the container-world equivalent of the Auto Scaling Group in the EC2 path, but managing containers instead of whole virtual machines. |
| **ECS** (Elastic Container Service) | AWS's own, simpler container orchestrator. With **Fargate** (see below), you never manage the underlying servers at all — you just say "run this container" and AWS handles where. |
| **Fargate** | The "serverless" way to run ECS (or EKS) containers — no EC2 instances to patch or size yourself; you're billed for the container's actual CPU/memory, not for a whole VM. |
| **EKS** (Elastic Kubernetes Service) | AWS's managed version of **Kubernetes**, the industry-standard (not AWS-specific) container orchestrator. More powerful and more complex than ECS — the right choice if you need Kubernetes specifically (e.g. matching another team's setup, or its larger ecosystem), not because it's "better" in general. |
| **Kubernetes (k8s)** | An open-source system for the same job as ECS — deciding where containers run, restarting them, scaling them — but usable on any cloud, or no cloud at all, not just AWS. Its concepts (Pod, Deployment, Service — see [`eks.md`](eks.md)) are worth learning regardless of which orchestrator you end up using, since most of the industry uses this vocabulary. |
| **CI/CD** (Continuous Integration / Continuous Deployment) | Automation that runs your tests and ships your code every time you push a change, instead of a human running commands. "CI" = automatically build + test; "CD" = automatically deploy the result. |
| **Jenkins** | A widely-used, self-hosted automation server for building CI/CD pipelines — you write a `Jenkinsfile` describing the steps ("build the image, push it, deploy it"), and Jenkins runs them whenever code changes. |
| **Pipeline** | The actual sequence of automated steps — checkout code → run tests → build image → push to registry → deploy — defined as code in a `Jenkinsfile`. |

## What was built

- **[`apps/server/Dockerfile`](../../../../apps/server/Dockerfile)**, **[`apps/admin/Dockerfile`](../../../../apps/admin/Dockerfile)**, **[`apps/widget/Dockerfile`](../../../../apps/widget/Dockerfile)** — real, working Dockerfiles for all three apps, each with comments explaining every step.
- **[`docker-compose.yml`](../../../../docker-compose.yml)** (repo root) — runs all three containers plus Postgres and Redis, entirely on your own machine, for testing before shipping anything to AWS:
  ```bash
  docker compose up --build
  ```
  The server auto-migrates its own database schema on boot (`ensureDbSchema()` in `apps/server/src/index.ts`), so this genuinely just works with no separate migration step — try it before touching any of ECS/EKS/Jenkins below.
- **[`jenkins.md`](jenkins.md)** — a Jenkins pipeline that builds all 3 images, pushes them to ECR, and deploys to ECS on every push to `main`.
- **[`ecs.md`](ecs.md)** — running the containers on ECS Fargate (the simpler orchestrator — start here).
- **[`eks.md`](eks.md)** — the same containers, on EKS/Kubernetes instead (the more powerful, more complex option), with manifests in [`k8s/`](k8s/).

## ECS or EKS — which one?

| | ECS (Fargate) | EKS |
|---|---|---|
| Complexity | Lower — a handful of AWS-specific concepts | Higher — real Kubernetes, its own whole vocabulary |
| Where else it works | AWS only | Any cloud, or your own hardware — the same manifests mostly just work |
| Best for | Getting containers running in production without a Kubernetes learning curve | Teams that already use (or want to learn) Kubernetes specifically, or need its larger ecosystem (Helm charts, operators, etc.) |
| Cost to run the *control plane* | Free (ECS itself has no extra charge, only the containers' compute) | ~$73/month flat, on top of the containers' compute, just for the cluster to exist |

**Start with ECS** ([`ecs.md`](ecs.md)) unless you have a specific reason to need Kubernetes — it gets you to "containers running in production" with far less new vocabulary, and the container/Dockerfile/CI work is identical either way.
