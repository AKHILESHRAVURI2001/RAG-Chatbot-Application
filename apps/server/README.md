# Server

The brain of the chatbot. It stores your content, finds answers, calls the AI, and controls who can do what in the admin panel.

Built with Node.js, Express, TypeScript and PostgreSQL.

## Run it

```bash
cp .env.example .env            # then fill in DATABASE_URL, ADMIN_JWT_SECRET and one AI key
npm run migrate                 # create or update the database tables (safe to run again)
npm run create-admin -- --email=you@example.com --password=ChooseOne123
npm run dev                     # http://localhost:4000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the server, reloading on changes |
| `npm run build` / `npm run start` | Build, then run for production |
| `npm run migrate` | Apply the database changes in `db/migrations/` |
| `npm run create-admin` | Create (or reset) a full-access admin login |
| `npm run seed` | Add a few sample FAQs |
| `npm test` | Run the tests |

## Settings (`.env`)

Copy `.env.example`; it lists everything. The ones that matter:

| Setting | What it is |
| --- | --- |
| `DATABASE_URL` | Your PostgreSQL connection (needs the `pgvector` add-on) |
| `ADMIN_JWT_SECRET` | Long random text used to sign admin logins (16+ characters) |
| `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | Your AI key(s). You can also add them later in the admin panel |
| `ALLOWED_ORIGINS`, `ADMIN_ORIGINS` | Websites allowed to call the server. **If you don't set them, every website is allowed — set them for production** |
| `REDIS_URL` | Optional. Without it the server keeps saved answers in its own memory |
| `ALLOW_PRIVATE_URL_FETCH` | Leave `false`. Set `true` only to add content from an internal company network |

## Where things are

Each feature has its own folder in `src/features/`, and everything about it is inside:

```
src/features/faqs/
  faqs.routes.ts     the URLs, and who may use each
  faqs.handlers.ts   reads the request and sends the reply
  faqs.queries.ts    the database queries
```

Other folders you'll meet:

| Folder | What's in it |
| --- | --- |
| `src/features/chat/` | How a visitor's question is answered — split into small files, one job each (see `docs/ARCHITECTURE.md`) |
| `src/features/settings/` | The admin's settings, one file per kind of job: `settings.handlers.ts` (read and save settings), `apiKeys`, `connectionTests`, `widgetIcon`, `maintenance` |
| `src/features/auth/`, `roles/`, `audit/` | Logins, roles and permissions, and the audit log |
| `src/features/documents/` | Turning a web page, file or text into searchable content |
| `src/providers/` | The AI, voice and embedding services (one file each) |
| `src/routes/index.ts` | The list of every feature, in one place |
| `db/migrations/` | The numbered database changes |
| `tests/` | Tests, in the same layout as `src/` |

## How a request travels

```
 Request -> Who is it? (sign-in check) -> Are they allowed? (permission check)
         -> Handler (checks the input) -> Database queries -> Reply
```

## Who can do what

Every admin URL says which permission it needs (for example `faqs.edit`). The server checks this on every request, so hiding a button in the admin panel is never the only protection. The list of permissions is in `src/shared/permissions.ts`.

## More

- How a request travels through the server (with diagrams): [`docs/flow.md`](docs/flow.md)
- How to add a feature: [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
- Putting it online: [`../../docs/hostingsupport/`](../../docs/hostingsupport/)
