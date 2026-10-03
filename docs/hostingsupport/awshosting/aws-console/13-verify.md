# 13. Verify Everything Works

← [Back to overview](README.md) | **You are here: Step 13 of 13 (last step)** | ← Previous: [12. CloudFront](12-cloudfront.md)

Open these in a browser, or use `curl`:

- `https://YOUR_DISTRIBUTION_DOMAIN/` → the admin dashboard loads
- `https://YOUR_DISTRIBUTION_DOMAIN/widget.js` → downloads/displays the widget script
- `https://YOUR_DISTRIBUTION_DOMAIN/api/health` → `{"ok":true}`
- Log into the admin dashboard with the account from [step 11](11-access-instance.md), send a real chat message, confirm you get a real answer back.

If the LLM says "no API key configured" even though you set one — a **brand-new database defaults its settings to the wrong provider**. Go to admin **Settings** and set the correct one. See [`../troubleshooting.md`](../troubleshooting.md) for the full explanation.

## You're done — final checklist

- [ ] Admin dashboard loads and you can log in
- [ ] Widget.js is reachable
- [ ] `/api/health` returns `{"ok":true}`
- [ ] A real chat message gets a real answer (proves database + cache + LLM key are all correctly wired, not just that processes are running)
- [ ] LLM provider in admin Settings matches the key you actually configured

## What to do next

- **Shipping a code change later**: see [`../aws-cli/redeploy.md`](../aws-cli/redeploy.md) — the same rebuild/re-upload/restart steps work whether you built the infrastructure by clicking through the Console or with the CLI; only *how you created* the resources differed, not how you use them afterward.
- **Something not working?** Check [`../troubleshooting.md`](../troubleshooting.md) first — it covers the exact bugs hit building this the first time.
- **Want the same setup in reusable, repeatable form instead of manual clicks?** See [`../terraform/`](../terraform/README.md).
- **Want containers instead of EC2?** See [`../pipeline/`](../pipeline/README.md) (ECS/EKS + Jenkins) — a bigger step up, worth it once this version feels comfortable.
