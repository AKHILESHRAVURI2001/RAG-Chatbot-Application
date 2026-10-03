# 7. Secrets Manager

← [Back to overview](README.md) | **You are here: Step 7 of 13** | ← Previous: [6. IAM Role for the App Servers](06-iam.md)

Search for the **Secrets Manager** service.

1. **Store a new secret**.
2. **Secret type**: Other type of secret
3. Switch to the **Plaintext** tab and paste (fill in your real values — the DB password from [step 3](03-rds.md), and a long random string of your own choosing for the JWT secret, e.g. mash your keyboard for 40 characters or use any password generator):
   ```json
   {
     "ADMIN_JWT_SECRET": "a-long-random-string-you-make-up",
     "DB_PASSWORD": "the-rds-password-from-step-3",
     "GEMINI_API_KEY": "your-real-gemini-key-or-leave-blank",
     "SARVAM_API_KEY": ""
   }
   ```
4. **Next**
5. **Secret name**: `mcb/app-env`
6. Click through the remaining defaults → **Store**.

## ✅ Checkpoint before moving on
- Secret `mcb/app-env` exists with all 4 keys, real values filled in for at least `ADMIN_JWT_SECRET` and `DB_PASSWORD`

---
**Next →** [8. Application Load Balancer](08-load-balancer.md)
