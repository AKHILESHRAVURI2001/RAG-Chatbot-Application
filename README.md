# MiniChatbotAgent

A chatbot you host yourself. You give it your content (web pages, PDFs, text), and it answers your visitors' questions from that content.

![The three parts](docs/images/overview.svg)

| Part | What it is | Folder |
| --- | --- | --- |
| **Widget** | The chat bubble that sits on your website | [`apps/widget`](apps/widget) |
| **Admin panel** | Where you add content, set up the bot and read chats | [`apps/admin`](apps/admin) |
| **Server** | The brain: stores content, finds answers, talks to the AI | [`apps/server`](apps/server) |

## Contents

- [Features](#features)
- [How a question is answered](#how-a-question-is-answered)
- [Built with](#built-with)
- [Project structure](#project-structure)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Put the chatbot on your website](#put-the-chatbot-on-your-website)
- [Scripts](#scripts)
- [Testing](#testing)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Contributing and security](#contributing-and-security)
- [License](#license)

## Features

- **Teach it your content.** Add a web page, a sitemap, a file (PDF, Word, CSV, text…) or paste text.
- **Control the answers.** Add FAQs, ready-made answers, and words the bot must refuse.
- **Choose the AI.** Claude, OpenAI, Gemini, or any OpenAI-compatible service. Switch in the admin panel.
- **Talk by voice** (optional). Visitors speak and hear the answer back, hands-free — see [`docs/VOICE.md`](docs/VOICE.md).
- **Share access safely.** Create roles such as "Content Creator" and pick exactly what each role may do. Every important change is recorded in an audit log.
- **Keep costs low.** Questions are answered from FAQs and saved answers first. The AI is only called when needed.
- **Stay in control.** Message limits per visitor, blocked words, a read-only SQL console and protection against fetching internal network addresses.

## How a question is answered

The bot tries the cheapest option first and stops as soon as one works. The AI is nearly the last resort.

![How a question is answered](docs/images/question-flow.svg)

### The two caches (steps 2 and 5)

Both remember answers the bot has already given, so the same work is never done twice. They are not in the admin menu because they fill up on their own.

| | **Exact cache** (step 2) | **Semantic cache** (step 5) |
| --- | --- | --- |
| Matches | The same question, word for word (ignoring capitals and punctuation) | A question with the **same meaning**, even in different words |
| Example | "What is stamp duty?" = "what is stamp duty" | "How much stamp duty do I pay?" ≈ "What's the stamp duty cost?" |
| Stored in | **Redis** (or the server's own memory if you don't use Redis) | **The database** (`query_cache` table, matched by meaning) |
| Speed | Fastest — a simple lookup | A little slower — compares meanings |
| Lasts | Until it expires (`CACHE_TTL_SECONDS`, one day by default) or you add content | Until it expires or you add content |

Adding or deleting content clears both, so old answers don't linger. The bot also saves its own good AI answers as **Question Chunks** (you can see and edit them in the admin panel), so even the next person who asks gets the answer instantly. You can turn that off in Question Chunks → "Auto-store".

## Built with

| Layer | Technology |
| --- | --- |
| Server | Node.js, Express, TypeScript |
| Database | PostgreSQL with the `pgvector` add-on (search by meaning) |
| Cache | Redis (optional) |
| Admin panel | React, Vite, TypeScript |
| Widget | TypeScript, no framework — builds to one `widget.js` |
| AI | Anthropic Claude, OpenAI, Google Gemini, or any OpenAI-compatible service |
| Voice | Sarvam AI or OpenAI |

## Project structure

```
.
├── apps/
│   ├── server/     the API — chat answering, content, permissions, AI calls
│   ├── admin/      the admin panel
│   └── widget/     the chat widget
├── docs/
│   ├── ARCHITECTURE.md   where things live and how to add to them
│   ├── VOICE.md          how the voice agent works
│   ├── understand/       a guided tour for newcomers
│   ├── images/           the diagrams
│   └── hostingsupport/   guides for putting it online
├── start.bat / stop.bat  Windows: start or stop all three apps
├── build.bat             rebuild the widget file
└── package.json          the workspace root
```

## Requirements

| You need | Notes |
| --- | --- |
| Node.js 18+ | 20 or newer is recommended |
| PostgreSQL 13+ with `pgvector` | A free hosted one works (Supabase, Neon) — see [`docs/hostingsupport/freehosting/postgres.md`](docs/hostingsupport/freehosting/postgres.md) |
| One AI key | Gemini, OpenAI or Anthropic. You can also add keys later in the admin panel |
| Redis (optional) | Without it the exact cache falls back to the server's own memory (fine for one server; use Redis when running several) |
| Sarvam AI or OpenAI key (optional) | Only for voice |

**Keep the server and the database in the same region.** The server asks the database many questions for each message, so distance makes replies slower.

## Quick start

```bash
git clone https://github.com/AKHILESHRAVURI2001/RAG-Chatbot-Application.git
cd RAG-Chatbot-Application
npm install
cp apps/server/.env.example apps/server/.env
cp apps/admin/.env.example apps/admin/.env
```

Open `apps/server/.env` and fill in:

```
DATABASE_URL=postgres://user:password@host:5432/dbname
ADMIN_JWT_SECRET=any-long-random-text
GEMINI_API_KEY=your-key        # or OPENAI_API_KEY / ANTHROPIC_API_KEY
```

`apps/admin/.env` just points at the server: `VITE_API_BASE_URL=http://localhost:4000/api`

Then:

```bash
npm run db:migrate                                   # create the tables
npm run create-admin -w apps/server -- --email=you@example.com --password=ChooseOne123
npm run dev:server     # API    → http://localhost:4000
npm run dev:admin      # Admin  → http://localhost:5174
npm run dev:widget     # Widget → http://localhost:5175
```

Sign in to the admin panel with the email and password you just created. On Windows, double-click `start.bat` to do all of this in one go (the server then runs on port 4001).

`create-admin` makes a full-access **Admin**. Everyone else is added in the admin panel under **Access Control**, where you also create roles and choose what each can do.

## Configuration

The settings that matter (all in `apps/server/.env`; the file `.env.example` lists the rest):

| Setting | What it is |
| --- | --- |
| `DATABASE_URL` | Your PostgreSQL connection |
| `ADMIN_JWT_SECRET` | Long random text used to sign admin logins (16+ characters) |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Your AI key(s) |
| `ALLOWED_ORIGINS`, `ADMIN_ORIGINS` | Websites allowed to call the server. **Set these for production** — if you don't, every website is allowed |
| `REDIS_URL` | Optional Redis connection |

Everything else — the AI model, prompts, widget look, opening hours, limits — is set in the admin panel, not in files. Details: [`apps/server/README.md`](apps/server/README.md).

## Put the chatbot on your website

```bash
npm run build:widget
```

Upload `apps/widget/dist/widget.js` somewhere public, then add this to your page:

```html
<script src="https://your-site.com/widget.js" data-api="https://your-api.com/api" defer></script>
```

Colors, greeting, opening hours and more are set in the admin panel — no code needed. See [`apps/widget/README.md`](apps/widget/README.md) for the few optional settings.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev:server` / `dev:admin` / `dev:widget` | Run one app while you work on it |
| `npm run build` | Build all three apps |
| `npm run build:widget` | Build only `apps/widget/dist/widget.js` |
| `npm run db:migrate` | Create or update the database tables (safe to run again) |
| `npm test` | Run the server's tests |

## Testing

```bash
npm test
```

The tests cover the answering flow, sign-in and permissions (including attempts to give a role more power than its creator has), the audit log, limits, search, adding content and the speech services. They live in `apps/server/tests/`, in the same layout as the code.

## Deployment

Guides are in [`docs/hostingsupport/`](docs/hostingsupport/): free-tier hosting, and AWS (command line, console clicks, Terraform, or containers with a build pipeline).

Before going live:

- Set `ALLOWED_ORIGINS` and `ADMIN_ORIGINS` to your own domains.
- Use a long random `ADMIN_JWT_SECRET`.
- Run the server in the same region as its database.

## Documentation

| I want to… | Read |
| --- | --- |
| See the project in 7 slides | [`docs/MiniChatbotAgent-overview.pdf`](docs/MiniChatbotAgent-overview.pdf) |
| Learn how the code works, step by step | [`docs/understand/`](docs/understand/) |
| Find where things are, or add a feature | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Understand (or set up) the voice agent | [`docs/VOICE.md`](docs/VOICE.md) |
| Put it online | [`docs/hostingsupport/`](docs/hostingsupport/) |
| Work on one part | [`apps/server`](apps/server/README.md), [`apps/admin`](apps/admin/README.md) or [`apps/widget`](apps/widget/README.md) |

## Contributing and security

- Want to help? Read [`CONTRIBUTING.md`](CONTRIBUTING.md).
- Found a security problem? Please follow [`SECURITY.md`](SECURITY.md) instead of opening a public issue.

## License

[MIT](LICENSE)
