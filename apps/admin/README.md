# Admin panel

The website you use to run the chatbot: add content, set up the bot, read chats, and manage who has access.

Built with React, Vite and TypeScript.

## Run it

```bash
cp .env.example .env     # VITE_API_BASE_URL must point to the server, e.g. http://localhost:4000/api
npm run dev              # http://localhost:5174
```

Sign in with the account you made using `npm run create-admin` in the server (see the server README).

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the admin panel |
| `npm run build` | Check the code and build it for production |
| `npm run preview` | Try the production build locally |

`VITE_API_BASE_URL` is built into the app, so run `npm run build` again if the server address changes.

## How the panel decides what to show

```
 Open the panel
      |
      v
 Signed in? --no--> sign-in page
      | yes
      v
 Ask the server: "who am I and what may I do?"
      |
      v
 Show only the menus and buttons this role is allowed
```

## What's in it

| Menu | What you do there |
| --- | --- |
| **Dashboard** | See how much the bot is being used |
| **Knowledge Base** | Restricted words, FAQs, ready-made answers, your content, fallbacks, and questions the bot couldn't answer |
| **Chat Logs** | Read conversations, block a visitor, export |
| **Chat Agent / Voice Agent / Vector** | Choose the AI, its voice and how content is searched (how voice works: [`../../docs/VOICE.md`](../../docs/VOICE.md)) |
| **Settings** | Look and feel of the widget, opening hours, limits |
| **Access Control** | Add admins, create roles, see the audit log |

People only see the menus and buttons their role allows. (The server also checks every action, so this is not just for show.)

## Where things are (`src/`)

| Folder / file | What it is |
| --- | --- |
| `routes.tsx` | The list of all pages — one line each. The menu is built from it |
| `pages/` | One file per page |
| `components/ui/` | Ready-made parts: buttons, cards, tables, pop-ups. Use these for new screens |
| `components/` | Larger pieces used by pages |
| `lib/api.ts` | The only place that talks to the server |
| `lib/authContext.tsx` | Knows who is signed in and what they may do |
| `shared/` | A copy of the server's shared types — keep it identical (see `docs/ARCHITECTURE.md`) |

## More

- How the panel works inside (with diagrams): [`docs/flow.md`](docs/flow.md)
- How to add a page: [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
- Putting it online: it's a static site (Vercel, Netlify, Cloudflare Pages). Add its web address to `ADMIN_ORIGINS` on the server. Guides: [`../../docs/hostingsupport/`](../../docs/hostingsupport/)
