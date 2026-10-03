# Free Backend (API Server) Hosting Guide (Render)

This guide details **100% free hosting** for the `apps/server` Express/TypeScript API using Render.

---

## Why not Vercel?

Vercel is great for the two static pieces (admin panel, widget — see [`admin-panel.md`](admin-panel.md) and [`widget-panel.md`](widget-panel.md)), but **not** for this server:

- It's a long-lived Express process that keeps a Postgres connection pool open and loads a local embedding model (`Xenova/all-MiniLM-L6-v2`, ~90MB) into memory once and reuses it for every request.
- Vercel's serverless functions are stateless with a short execution timeout on the free tier — every cold start would try to reload that 90MB model and likely time out, in-memory caches would reset constantly, and a fresh DB pool per invocation can exhaust Supabase's connection limit under load.

So the backend needs an **always-on container host** instead. Render's free web service fits (Railway, Fly.io, Koyeb are equivalent alternatives).

---

## Prerequisites

- Your code pushed to the correct GitHub repository (double-check you're connecting Render to the right repo — see Troubleshooting below).
- A Postgres database already set up (Supabase/Neon — see [`postgres.md`](postgres.md)), with migrations applied and an admin account created:
  ```bash
  npm run db:migrate
  npm run create-admin -w apps/server -- --email=you@example.com --password=YourSecurePassword
  ```

---

## Step-by-Step Setup

1. **Sign Up / Log In**: Go to [render.com](https://render.com) and log in (GitHub login is easiest).
2. **New → Web Service** → connect your GitHub account if prompted → select the repository that actually contains this project (e.g. `your-username/RAG-Chatbot-Application`).
   > If the repo doesn't show up in the picker, go to **Render → Account Settings → GitHub → Configure** and grant Render access to it.
3. **Configure the service**:

   | Field | Value |
   |---|---|
   | Name | anything, e.g. `minichatbot-api` |
   | Root Directory | `minichatbotagent` (the project lives in this subfolder, not the repo root) |
   | Runtime | Node |
   | Build Command | `npm install && npm run build:server` |
   | Start Command | `npm run start -w apps/server` |
   | Instance Type | **Free** |

4. **Environment Variables** — add each of these (copy actual values from your local `apps/server/.env`, don't reference the file itself):

   **Required:**
   - `NODE_ENV=production`
   - `DATABASE_URL` — your Supabase/Neon pooler connection string
   - `DATABASE_SSL` — same value as local (`true` for Neon, depends on setup for Supabase)
   - `ADMIN_JWT_SECRET` — a long random string (`openssl rand -base64 32`)
   - At least one of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`
   - `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`

   **CORS** (fill in once you know the URLs, or start permissive and tighten):
   - `ALLOWED_ORIGINS` — the domain(s) the widget `<script>` tag will run on
   - `ADMIN_ORIGINS` — your admin panel's Vercel URL

   **Optional:**
   - `REDIS_URL` (Upstash), `CACHE_TTL_SECONDS`, `SEMANTIC_CACHE_SIMILARITY_THRESHOLD`, `FAQ_SIMILARITY_THRESHOLD`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `SARVAM_API_KEY`

   **Don't set:**
   - `PORT` — Render assigns this automatically.

5. Click **Create Web Service**. First deploy takes a few minutes; first boot also downloads the embedding model, so the first request can be slow.
6. Once live, verify:
   ```bash
   curl https://your-service-name.onrender.com/api/health
   # {"ok":true}
   ```

---

## Wire It to the Admin Panel and Widget

1. **Admin panel (Vercel)** → Project → Settings → Environment Variables → update:
   ```
   VITE_API_BASE_URL=https://your-service-name.onrender.com/api
   ```
   → **Redeploy** (this is baked in at build time, so a redeploy is required for the change to take effect).
2. **Widget embed tag** — update `data-api` on any live `<script>` tag:
   ```html
   <script src="https://your-widget.vercel.app/widget.js"
           data-api="https://your-service-name.onrender.com/api"
           defer></script>
   ```
3. Back on Render, make sure `ADMIN_ORIGINS` and `ALLOWED_ORIGINS` match the real Vercel/website URLs, then redeploy the backend.

---

## Free Tier: What to Expect

Render's free web service has **no time limit and no card required** — it's not a trial. The trade-offs:

- **750 free instance-hours per workspace per month** (enough for one always-on service).
- **Spins down after 15 minutes of inactivity**; the next request takes ~30–60s to wake it back up.
- A free cron ping every 10 minutes (e.g. [cron-job.org](https://cron-job.org) hitting `/api/health`) keeps it warm if that cold-start delay is a problem.

Note: this does **not** apply to your database — Render's own free Postgres expires after 30 days, but you're using Supabase/Neon for the DB, which has its own separate free-tier terms.

---

## 🔍 Common Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| `npm error enoent Could not read package.json` / `ENOENT ... /opt/render/project/src/package.json` | Root Directory not set, or set incorrectly — Render is looking at the repo root, but the project lives in a subfolder | Set **Root Directory** to `minichatbotagent` in service settings |
| `Root directory "minichatbotagent" does not exist. Verify the Root Directory...` | Render is connected to the **wrong GitHub repository** (one that doesn't have this folder structure) | Go to service Settings → change the connected repository to the correct one (e.g. `RagChatbotAgents`), or delete and recreate the service pointed at the right repo |
| Health check works but admin panel shows "Failed to fetch" | `ADMIN_ORIGINS` on Render doesn't include the admin panel's Vercel URL, or `VITE_API_BASE_URL` wasn't redeployed after changing | Fix `ADMIN_ORIGINS` and redeploy backend; redeploy admin panel after changing `VITE_API_BASE_URL` |
| `Missing settings row for key "llm"` or similar DB errors | Migrations never ran against this database | Run `DATABASE_URL="<your-db-url>" npm run db:migrate` from your machine |
| `no API key configured` | No LLM provider key set on Render | Add `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`, or set one later in Admin → Settings → AI |
| First request after idle takes ~30-60s | Free tier cold start (expected behavior, not a bug) | Add a cron-job health-check ping every 10 min to keep it warm |
| `too many connections` from Postgres | Free-tier connection cap exceeded (common if pointed at a non-pooled connection string) | Make sure `DATABASE_URL` uses the **pooler** connection string (Supabase: port `6543`/`5432` session pooler; Neon: the pooled connection toggle) |

---

## Related

- [`postgres.md`](postgres.md) — free Postgres + pgvector hosting (Supabase/Neon/Docker)
- [`admin-panel.md`](admin-panel.md) — free admin dashboard hosting (Vercel)
- [`widget-panel.md`](widget-panel.md) — free widget hosting (Vercel)
