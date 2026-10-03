# 6. IAM Role for the App Servers

← [Back to overview](README.md) | **You are here: Step 6 of 13** | ← Previous: [5. S3 Buckets](05-s3.md)

Search for the **IAM** service.

1. Left sidebar → **Roles** → **Create role**.
2. **Trusted entity type**: AWS service
3. **Use case**: **EC2** → **Next**
4. Skip attaching a managed policy for now → **Next**
5. **Role name**: `mcb-ec2-role` → **Create role**
6. Open the role you just created → **Permissions** tab → **Add permissions → Attach policies** → search for and attach **AmazonSSMManagedInstanceCore** (this is what lets you reach the instance later without SSH — see [step 11](11-access-instance.md)).
7. Still on the role → **Add permissions → Create inline policy** → **JSON** tab → paste:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["secretsmanager:GetSecretValue"],
         "Resource": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:mcb/app-env-*"
       },
       {
         "Effect": "Allow",
         "Action": ["s3:GetObject"],
         "Resource": "arn:aws:s3:::mcb-deploy-artifacts-yourinitials123/*"
       }
     ]
   }
   ```
   Replace `YOUR_ACCOUNT_ID` (find it top-right, under your username) and the artifacts bucket name (from [step 5](05-s3.md)) with your real ones. Name the policy `mcb-ec2-access` → **Create policy**.

You'll create the `mcb/app-env` secret itself in [step 7](07-secrets-manager.md), next — the role is allowed to read it before it exists, which is fine; IAM permissions don't require the target to exist yet.

## ✅ Checkpoint before moving on
- Role `mcb-ec2-role` exists with two things attached: the AWS-managed `AmazonSSMManagedInstanceCore` policy, and your own inline `mcb-ec2-access` policy

---
**Next →** [7. Secrets Manager](07-secrets-manager.md)
