# Free Widget Hosting Guide (Vercel)

This guide details **100% free hosting** for the `apps/widget` embeddable chat widget using Vercel.

---

## Prerequisites

- Your code pushed to a GitHub repository (Vercel deploys from a connected repo).
- The backend API deployed somewhere reachable over HTTPS (e.g. Render) — the widget calls it at runtime.

---

## Step-by-Step Setup

1. **Sign Up / Log In**: Go to [vercel.com](https://vercel.com) and log in (GitHub login is easiest).
2. **Import the Project**:
   - Click **Add New → Project**.
   - Find and **Import** your repository (e.g. `your-username/RAG-Chatbot-Application`).
   - You can create a second Vercel project from the same repo — one for the admin panel, one for the widget.
3. **Configure the Project** (on the import screen):

   | Field | Value |
   |---|---|
   | Framework Preset | Vite (auto-detect) or "Other" |
   | Root Directory | `minichatbotagent/apps/widget` (click **Edit** next to Root Directory) |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |
   | Install Command | `npm install` |

4. **Environment Variables**: **none needed.** The widget is a self-contained IIFE bundle (`dist/widget.js`) — it reads its API URl and options at runtime from the `<script>` tag's `data-*` attributes, not from build-time env vars.
5. **Deploy**. Wait ~1 minute.
6. You'll get a URL like `https://your-project-widget.vercel.app`, and the built file is served at:
   ```
   https://your-project-widget.vercel.app/widget.js
   ```

---

## Embed It on a Website

Add a single `<script>` tag to any page:

```html
<script
  src="https://your-project-widget.vercel.app/widget.js"
  data-api="https://your-api.onrender.com/api"
  data-title="Customer Support"
  data-primary-color="#4f46e5"
  data-icon="https://your-domain.com/avatar.png"
  defer>
</script>
```

| Attribute | Required | Description |
| :--- | :--- | :--- |
| `data-api` | ✅ | URL to the backend API base endpoint (`/api`) |
| `data-title` | | Custom title shown in the widget header |
| `data-primary-color` | | Hex/RGB theme color |
| `data-icon` | | Avatar image URL or emoji |
| `data-document-id` | | Restrict knowledge search to a single document |
| `data-tag` | | Restrict knowledge search to documents with this tag |

---

## Wire It to the Backend

Once deployed, add the website's domain (wherever the `<script>` tag is embedded) to the backend's `ALLOWED_ORIGINS` environment variable, then redeploy the backend:

```env
ALLOWED_ORIGINS=https://your-website.com
```

Without this, the browser blocks the widget's API calls with a CORS error and the chat bubble either won't appear or won't respond.

---

## 🔍 Common Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| Chat bubble never appears | Backend API is down/asleep, or its origin check rejected the request | `curl https://your-api.onrender.com/api/health`; confirm `ALLOWED_ORIGINS` includes the embedding site's exact domain (scheme + host, no trailing slash) |
| Widget loads but shows a CORS error in the console | `ALLOWED_ORIGINS` doesn't include this site | Add the domain and redeploy the backend |
| `Cannot find module @rollup/rollup-linux-x64-gnu` during build | Stale platform-specific `package-lock.json` (see [npm/cli#4828](https://github.com/npm/cli/issues/4828)) | Already resolved for this repo — `package-lock.json` is gitignored, so each host installs fresh. If it recurs: delete `node_modules` + `package-lock.json`, run `npm install` again |
| Style conflicts with the host site's CSS | Widget styles leaking in/out | The widget renders inside its own shadow DOM / scoped container — if you see conflicts, check for `!important` overrides on the host page targeting generic tags |
| Wrong/old widget appears after a Vercel redeploy | Browser or CDN cache | Hard-refresh, or bump a cache-busting query string temporarily: `widget.js?v=2` |

---

## Related

- [`postgres.md`](postgres.md) — free Postgres + pgvector hosting (Supabase/Neon/Docker)
- [`admin-panel.md`](admin-panel.md) — free admin dashboard hosting (Vercel)
- Backend (API server) hosting is not covered here — it needs an always-on host (e.g. Render), not Vercel, since it keeps a DB connection pool and an in-memory embedding model alive between requests.
