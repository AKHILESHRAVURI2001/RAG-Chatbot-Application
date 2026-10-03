# 10. Build and Upload the Actual App Code

← [Back to overview](README.md) | **You are here: Step 10 of 13** | ← Previous: [9. Launch Template + Auto Scaling Group](09-launch-template-asg.md)

None of the AWS Console steps so far build or upload your application's code — that's a separate, deliberate step (this is true for the CLI and Terraform paths too — infrastructure and application deployment are different jobs).

On your own computer, in this repo:

```bash
npm run build   # builds server, admin, widget
```

Then use the **S3 Console** (search "S3", open your buckets) and just drag-and-drop / **Upload**:
- Everything in `apps/admin/dist/` → the root of your **static** bucket
- `apps/widget/dist/widget.js` → the root of your **static** bucket
- A `.zip` or `.tar.gz` of `apps/server/dist/` + `apps/server/db/` + `apps/server/scripts/run-migrations.mjs` + a trimmed `package.json` (no `devDependencies`) → your **artifacts** bucket, named `mcb-server-v1.tar.gz`

> **Critical for the admin dashboard**: before running `npm run build` for `apps/admin`, you must set `VITE_API_BASE_URL` to your live CloudFront URL ([step 12](12-cloudfront.md)), not `localhost`. This is baked into the built files permanently at build time — see [`../troubleshooting.md`](../troubleshooting.md) for exactly what goes wrong if you skip this. (If CloudFront doesn't exist yet on your first pass through this guide, that's fine — come back and rebuild/re-upload the admin dashboard once step 12 gives you the real URL.)

Once the artifact is uploaded, go back to your Launch Template ([step 9.1](09-launch-template-asg.md#91-launch-template)) → **Create new version** → same settings, and the instance will pull the real code the next time it boots. To make the *already-running* instance pick it up right now instead of waiting for a new one, see [step 11](11-access-instance.md).

## ✅ Checkpoint before moving on
- Static bucket contains `index.html`, an `assets/` folder, and `widget.js`
- Artifacts bucket contains `mcb-server-v1.tar.gz`

---
**Next →** [11. Getting Onto an Instance (No SSH Needed)](11-access-instance.md)
