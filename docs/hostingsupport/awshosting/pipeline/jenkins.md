# Jenkins Pipeline — Automating the Build-and-Ship Steps

This automates exactly the manual sequence from [`ecs.md`](ecs.md#shipping-a-code-change): build each image, push to ECR, tell ECS to deploy it — except triggered automatically on every push to `main`, instead of someone running those commands by hand.

## What Jenkins actually is

Jenkins is a program that runs on its own server (or, commonly, itself as a container) and watches for events — here, "code was pushed to GitHub." When one happens, it checks out the code and runs a **pipeline**: a sequence of steps you define once, as code, in a file called a `Jenkinsfile`. Every run is logged, so you can always see exactly what happened and why a deploy succeeded or failed.

## 1. Get Jenkins running

The quickest way to get a real Jenkins instance up to experiment with:

```bash
docker run -d --name jenkins -p 8080:8080 -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  jenkins/jenkins:lts
```

(The Docker socket mount lets Jenkins itself run `docker build` — Jenkins needs Docker available to build the images described in this pipeline.) Visit `http://localhost:8080`, unlock it with the initial admin password (`docker logs jenkins` shows where to find it), and install the suggested plugins plus the **Docker Pipeline** and **Amazon ECR** plugins.

For a real, always-on setup, Jenkins would run on an EC2 instance (or its own ECS service) instead of your laptop — the pipeline logic below is identical either way.

## 2. Credentials Jenkins needs

In Jenkins → **Manage Jenkins → Credentials**, add:
- An AWS access key with permission to push to ECR and update the ECS service (scoped tightly — only those two things, not full account access)
- Your GitHub repo's credentials (or a webhook secret), so Jenkins can check out the code

## 3. The `Jenkinsfile`

Place this at the repo root as `Jenkinsfile`:

```groovy
pipeline {
  agent any

  environment {
    AWS_REGION   = 'us-east-1'
    ACCOUNT_ID   = credentials('aws-account-id') // or hardcode it
    ECR_REGISTRY = "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Test') {
      steps {
        sh 'npm ci'
        sh 'npm run test -w apps/server'
      }
    }

    stage('Build images') {
      steps {
        sh "docker build -f apps/server/Dockerfile -t ${ECR_REGISTRY}/mcb-server:${GIT_COMMIT} ."
        sh "docker build -f apps/admin/Dockerfile --build-arg VITE_API_BASE_URL=https://your-live-domain/api -t ${ECR_REGISTRY}/mcb-admin:${GIT_COMMIT} ."
        sh "docker build -f apps/widget/Dockerfile -t ${ECR_REGISTRY}/mcb-widget:${GIT_COMMIT} ."
      }
    }

    stage('Push to ECR') {
      steps {
        sh "aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}"
        sh "docker push ${ECR_REGISTRY}/mcb-server:${GIT_COMMIT}"
        sh "docker push ${ECR_REGISTRY}/mcb-admin:${GIT_COMMIT}"
        sh "docker push ${ECR_REGISTRY}/mcb-widget:${GIT_COMMIT}"
      }
    }

    stage('Deploy to ECS') {
      steps {
        sh """
          aws ecs register-task-definition --cli-input-json file://ecs/mcb-server-task.json --region ${AWS_REGION}
          aws ecs update-service --cluster mcb-cluster --service mcb-server --force-new-deployment --region ${AWS_REGION}
        """
      }
    }
  }

  post {
    failure {
      echo 'Pipeline failed — nothing was deployed. Check the stage logs above for which step broke.'
    }
    success {
      echo "Deployed commit ${GIT_COMMIT} to ECS."
    }
  }
}
```

Each **stage** is one logical step, shown separately in Jenkins's UI — if "Test" fails, the pipeline stops there and "Deploy to ECS" never runs. This is the actual safety net CI/CD is for: a broken change physically cannot reach production, because the pipeline that would deploy it fails first.

## 4. Trigger it automatically on push

GitHub repo → **Settings → Webhooks → Add webhook** → URL: `http://your-jenkins-host:8080/github-webhook/`, content type `application/json`, event: **just the push event**. In the Jenkins job's configuration, check **GitHub hook trigger for GITScm polling**.

Now: push to `main` → GitHub notifies Jenkins → Jenkins runs the pipeline above → if tests pass, a new version is live on ECS, automatically, with zero manual steps and zero downtime (ECS's rolling deployment, same as in [`ecs.md`](ecs.md)).

## Where this fits with everything else in this repo

This `Jenkinsfile` targets ECS specifically. The same 4-stage shape (checkout → test → build image → deploy) works for EKS too — only the "Deploy" stage changes, from `aws ecs update-service` to `kubectl set image` (see [`eks.md`](eks.md#shipping-a-code-change)). The build/test/push stages are identical either way — that's the actual point of separating "how the app is packaged" (a container image) from "where it runs" (ECS vs EKS vs, in principle, anything else that can run a container).
