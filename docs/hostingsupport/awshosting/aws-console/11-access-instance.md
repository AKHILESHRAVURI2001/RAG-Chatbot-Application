# 11. Getting Onto an Instance (No SSH Needed)

← [Back to overview](README.md) | **You are here: Step 11 of 13** | ← Previous: [10. Build and Upload the Actual App Code](10-build-and-upload-code.md)

EC2 Console → **Instances** → select your running instance → **Connect** button → **Session Manager** tab → **Connect**.

This opens a real terminal, in your browser, running directly on the instance — no SSH key, no open port 22 (recall from [step 2](02-security-groups.md) that no security group opens it), and every command is logged. From here you can, for example, pull down the real code you just uploaded and restart the app immediately, instead of waiting for a fresh instance to launch:

```bash
sudo su -                     # become root (the app runs as root in this setup)
cd /opt/mcb
aws s3 cp s3://YOUR_ARTIFACTS_BUCKET/mcb-server-v1.tar.gz artifact.tar.gz --region us-east-1
tar xzf artifact.tar.gz
pm2 restart mcb-server
pm2 status                    # confirm it shows "online"
curl http://localhost:4000/api/health   # should print {"ok":true}
```

Run the database migration the same way, once, after the first real code upload:
```bash
cd /opt/mcb
node scripts/run-migrations.mjs
```

And create the first admin login:
```bash
node dist/scripts/createAdmin.js --email=you@example.com --password=YourSecurePassword123
```

## ✅ Checkpoint before moving on
- `pm2 status` shows `mcb-server` as `online` with a low restart count
- `curl http://localhost:4000/api/health` returns `{"ok":true}`
- Migrations ran without error
- You have an admin email + password written down

---
**Next →** [12. CloudFront (the Public URL)](12-cloudfront.md)
