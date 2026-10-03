# Troubleshooting — Every Real Bug Hit Building This

Each of these actually happened during the initial build. Read this before you hit the same wall a second time.

## "Failed to fetch" on the live admin dashboard

**Symptom**: admin dashboard loads, but every request fails with "Failed to fetch", and the browser's Network tab shows it calling `http://localhost:4001/...` even though you're on the live CloudFront URL.

**Cause**: `apps/admin` reads `VITE_API_BASE_URL` from `.env` **at build time** and Vite inlines it directly into the compiled JS. It's not a runtime config — you cannot fix this by editing anything after the build. If the admin app was built with the normal local `.env` (which points at `localhost:4001` for local dev), the deployed bundle will forever try to call `localhost:4001` from whoever's browser loads it.

**Fix**: always build the admin app for deployment with the override:
```bash
VITE_API_BASE_URL="https://<your-cloudfront-domain>/api" npm run build
```
See [`redeploy.md`](aws-cli/redeploy.md#admin-dashboard-change-appsadmin). Verify before deploying:
```bash
grep -c "localhost:400" dist/assets/*.js || echo "clean"
```

## App crash-loops on a fresh instance: `ReferenceError: File is not defined`

**Symptom**: `pm2 status` shows the app `errored` with a rising restart count; `pm2` logs show a stack trace through `undici`/`webidl` ending in `ReferenceError: File is not defined`.

**Cause**: the boot script's `dnf install -y nodejs20 ... || dnf install -y nodejs` silently fell back to Amazon Linux 2023's *default* `nodejs` package, which was **Node 18.20.8**, not Node 20. Node 18 doesn't have the global `File` class that a transitive dependency (`undici`, pulled in for `fetch` support, used by the Gemini SDK) expects at Node 20+.

**Fix**: never rely on AL2023's `nodejs20` package name (it may not exist / may resolve unexpectedly). Install Node 20 explicitly via NodeSource:
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
node --version   # confirm v20.x before continuing
```
This is already the case in the current `user-data.sh` (see [`manual-setup.md`](aws-cli/manual-setup.md#10-launch-template-the-ec2-boot-script)) — if you're seeing this bug, something reverted that.

## Chat replies with a generic "service is currently not available"

**Symptom**: `/api/chat` returns a sanitized error; the real cause is in the server's error log (not the API response — that's intentional, [`chatWidgetController.ts`](../../../apps/widget/src/core/chatWidgetController.ts)'s `sanitizeErrorMessage` and the server's own masking hide technical details from end users).

**Two distinct causes seen, check server logs (`pm2 logs mcb-server --lines 50`, or `tail -f /root/.pm2/logs/mcb-server-error.log` on the instance) to tell which**:

1. `The selected LLM provider "openai" has no API key configured` — **a brand-new database defaults the LLM provider setting to `openai`**, regardless of which key you actually put in Secrets Manager/`.env`. Migrations create the schema, not your preferred *values*. Fix: log into the admin dashboard → Settings → set the correct provider, **or** run a one-off DB update (see the `fix-llm-provider.mjs` pattern below) if you need it fixed before you can log in.

2. `No Gemini API key configured` (or similar, for whichever provider) even though you're sure you put the key in Secrets Manager — **double check you actually wrote the real key, not an empty placeholder**. It's easy to write a secret with a value you *meant* to fill in later and forget. Verify:
   ```bash
   aws secretsmanager get-secret-value --secret-id mcb/app-env --region us-east-1 --query SecretString --output text
   ```
   (Only run this somewhere you're comfortable seeing the real secret value on screen.)

**One-off DB fix pattern** (run via SSM on an instance, which can reach the private RDS):
```js
// upload as a .mjs, run with: node fix-llm-provider.mjs
import 'dotenv/config';
import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const res = await client.query("select value from settings where key = 'llm'");
const updated = { ...(res.rows[0]?.value ?? {}), provider: 'gemini', model: 'gemini-3.5-flash-lite' };
await client.query("update settings set value = $1 where key = 'llm'", [JSON.stringify(updated)]);
await client.end();
```

## `express-rate-limit` throws `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`

**Symptom**: logged (not fatal, requests still succeed) every time a request comes through the ALB.

**Cause**: Express doesn't trust the `X-Forwarded-For` header by default. Behind a load balancer, every request's `req.ip` would otherwise resolve to the ALB's own IP for every user — which silently breaks IP-based rate limiting (everyone shares one rate-limit bucket).

**Fix**: `app.set('trust proxy', 1)` in `apps/server/src/index.ts`, right after `const app = express()`. Already applied in this codebase — if you see this warning again, check that line is still there.

## `npm ci --omit=dev` inside `apps/server` deletes packages needed by `apps/admin`/`apps/widget`

**Symptom**: running `npm ci --omit=dev` from inside `apps/server` (trying to build a "production-only" `node_modules` to bundle into a deploy artifact) throws `EPERM: unlink ... @rollup/rollup-win32-x64-msvc...`, and afterward `require('express')` fails from the **repo root** — `express` is just gone.

**Cause**: this is an **npm workspaces monorepo** — most dependencies are hoisted to the single root `node_modules`, not duplicated per-package. Running `npm ci` (which does a clean reinstall) from *any* workspace package still operates on that shared root `node_modules`. It doesn't just add `apps/server`'s prod deps — it can partially delete packages that `apps/admin`/`apps/widget` need (like `rollup`'s native binary), corrupting the shared install.

**Fix**: don't try to bundle `node_modules` into the deploy artifact at all. Ship source only (`dist/`, `package.json` with `devDependencies` stripped, migrations) and let the **target EC2 instance** run its own `npm install --omit=dev` in its own isolated `/opt/mcb` directory — see [`manual-setup.md`](aws-cli/manual-setup.md#6-build-the-app-and-upload-artifacts). If you do accidentally corrupt local `node_modules` this way, `npm install` from the repo root restores it (verified: no lasting damage once you do this).

## Windows / Git Bash path gotchas

Several commands failed repeatedly for reasons that trace back to running the AWS CLI (a Windows-native `aws.exe`) from Git Bash (an MSYS/Unix-style shell) on Windows:

- **`file://` paths for `--secret-string`, `--policy`, `--launch-template-data`, etc.**: Git Bash's path style (`/c/Users/...`) is not understood by the native `aws.exe`. Use a Windows-style path with **forward slashes**: `file://C:/Users/you/scratch/file.json` (this form works in both Node.js and the AWS CLI on Windows and avoids backslash-escaping nightmares).
- **`node -e "..."` with path arguments**: same issue — pass `C:/Users/...` (forward slashes), not `/c/Users/...`, as an argument to a script that will `fs.readFileSync`/`writeFileSync` it.
- **Any CLI argument starting with `/`** (e.g. `--health-check-path /api/health`, an SSM parameter name like `/aws/service/...`): MSYS's automatic path conversion can silently rewrite `/api/health` into something like `C:/Program Files/Git/api/health`. Fix: `export MSYS_NO_PATHCONV=1` before the command.
- **Unicode characters in AWS CLI output on Windows**: if a command you're running on a remote instance prints a Unicode character (this codebase's migration script prints `ℹ`), fetching that output via `aws ssm get-command-invocation` can crash with `'charmap' codec can't encode character ...`. Fix: `export PYTHONUTF8=1` before the command.
- **`/tmp/...` paths passed to `node -e`**: Git Bash maps `/tmp` to a real Windows directory, but a native `node.exe` does not do that translation — it will try to open a literal path like `E:\tmp\...` relative to the current drive. Use an explicit path under your own scratch directory instead of `/tmp`.

## RDS Proxy: `FreeTierRestrictionError`

**Symptom**: `aws rds create-db-proxy` fails with `This feature isn't available with free plan accounts.`

**Cause**: your AWS account is on a free-tier-restricted plan. RDS Proxy is one of several features gated behind a plan upgrade (along with RDS backup retention beyond 1 day — see the `--backup-retention-period 1` note in [`manual-setup.md`](aws-cli/manual-setup.md#3-rds-postgresql)).

**Fix**: not fixable from the CLI — the account plan itself needs upgrading. Until then, the app connects to RDS directly (fine at today's scale; each app instance pools up to 10 connections — see `apps/server/src/db/pool.ts` — so watch Postgres's connection count as the Auto Scaling Group grows, and add RDS Proxy once the account allows it).

## `aws login` session expiring mid-task

Root-account or SSO sessions from `aws login` can expire (`The pending authorization to retrieve an SSO token has expired`) if the browser approval step isn't completed promptly. Just re-run `aws login` and complete the browser prompt faster next time; nothing else is wrong.
