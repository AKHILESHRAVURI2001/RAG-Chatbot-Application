# Free Admin Panel Hosting Guide (Vercel)

This guide details **100% free hosting** for the `apps/admin` React/Vite dashboard using Vercel.

---

## Prerequisites

- Your code pushed to a GitHub repository (Vercel deploys from a connected repo).
- The backend API already deployed somewhere reachable over HTTPS (e.g. Render) — or a placeholder URL if you're deploying the frontend before the backend and will update it later.

---

## Step-by-Step Setup

1. **Sign Up / Log In**: Go to [vercel.com](https://vercel.com) and log in (GitHub login is easiest — uses the same account as your repo).
2. **Import the Project**:
   - Click **Add New → Project**.
   - Find and **Import** your repository (e.g. `your-username/RAG-Chatbot-Application`).
3. **Configure the Project** (on the import screen):

   | Field | Value |
   |---|---|
   | Framework Preset | Vite (should auto-detect) |
   | Root Directory | `minichatbotagent/apps/admin` (click **Edit** next to Root Directory) |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |
   | Install Command | `npm install` |

4. **Environment Variables**: expand the section and add:
   ```env
   VITE_API_BASE_URL=https://your-api.onrender.com/api
   ```
   > This is baked into the JS bundle **at build time**. If you change it later, you must trigger a **Redeploy** (Vercel → Deployments → ⋯ → Redeploy) for the change to take effect — pushing new code isn't required.

5. **Deploy**. Wait 1-2 minutes.
6. You'll get a URL like `https://your-project-admin.vercel.app`. Open it and sign in with the admin account created via:
   ```bash
   npm run create-admin -w apps/server -- --email=you@example.com --password=YourSecurePassword
   ```

7. **(Recommended) Restrict public access**: Project → **Settings → Deployment Protection** → require Vercel login. The admin panel is normal login-protected, but there's no reason for it to be publicly indexed.

8. **Wire it to the backend**: once deployed, go to your backend host's environment variables and set:
   ```env
   ADMIN_ORIGINS=https://your-project-admin.vercel.app
   ```
   then redeploy the backend so CORS allows requests from the admin panel's origin.

---

## 🔍 Common Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| `Cannot find module @rollup/rollup-linux-x64-gnu` during build | `package-lock.json` was generated on Windows/macOS and is missing Linux-specific optional dependency entries (known npm bug: [npm/cli#4828](https://github.com/npm/cli/issues/4828)) | Delete `package-lock.json` and `node_modules`, run `npm install` again to regenerate, then either commit the new lockfile or add `package-lock.json` to `.gitignore` so each host resolves dependencies fresh |
| Admin panel loads but "Failed to fetch" on login | `VITE_API_BASE_URL` wrong, or backend's `ADMIN_ORIGINS` doesn't include this Vercel URL | Fix the Vercel env var and redeploy; fix `ADMIN_ORIGINS` on the backend and redeploy that too |
| Env var change has no effect | `VITE_*` vars are inlined at build time, not read at runtime | Trigger a Redeploy after changing the variable |
| 404 on every route except `/` | Vite SPA routing not configured | Not usually needed for this app (no client-side routes beyond `/`), but if added later, add a `vercel.json` rewrite: `{"rewrites": [{"source": "/(.*)", "destination": "/index.html"}]}` |
| Build works locally but fails on Vercel | Root Directory misconfigured, or a dependency only installed at the repo root instead of `apps/admin` | Double-check Root Directory is `minichatbotagent/apps/admin`; confirm the package is listed in `apps/admin/package.json`, not just the root `package.json` |

---

## Related

- [`postgres.md`](postgres.md) — free Postgres + pgvector hosting (Supabase/Neon/Docker)
- Backend (API server) hosting is not covered here — it needs an always-on host (e.g. Render), not Vercel, since it keeps a DB connection pool and an in-memory embedding model alive between requests.
