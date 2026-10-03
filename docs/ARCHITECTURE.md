# How the project is organized

Read this to find where things are, and to add something new without breaking anything. If programming is new to you, start with the [guided tour](understand/) first.

## The big picture

There are three apps. They only talk through the server:

![The three parts](images/overview.svg)

- **Server** (`apps/server`) — does the real work and makes every decision about who is allowed to do what.
- **Admin panel** (`apps/admin`) — a website for managing the bot. It only shows what the server allows.
- **Widget** (`apps/widget`) — the chat bubble visitors use.

## How a question is answered

The server tries the cheapest way first and stops at the first one that works (`apps/server/src/features/chat/chatService.ts`):

![How a question is answered](images/question-flow.svg)

### The two caches (steps 2 and 5)

Both remember answers the bot has already given, so the same work is never done twice. They are not in the admin menu because they fill up on their own.

| | **Exact cache** (step 2) | **Semantic cache** (step 5) |
| --- | --- | --- |
| Matches | The same question, word for word (ignoring capitals and punctuation) | A question with the **same meaning**, even in different words |
| Example | "What is stamp duty?" = "what is stamp duty" | "How much stamp duty do I pay?" ≈ "What's the stamp duty cost?" |
| Stored in | **Redis** (or the server's own memory if you don't use Redis) | **The database** (`query_cache` table, matched by meaning) |
| Speed | Fastest — a simple lookup | A little slower — compares meanings |
| Lasts | Until it expires (`CACHE_TTL_SECONDS`, one day by default) or you add content | Until it expires or you add content |

Adding or deleting content clears both, so old answers don't linger.

The bot also saves its own good AI answers as **Question Chunks** (you can see and edit them in the admin panel), so even the next person who asks gets the answer instantly. You can turn that off in Question Chunks → "Auto-store".

Anything the visitor doesn't need to wait for (saving the chat, saving answers for next time) happens in the background.

## How the answer code is organized

`apps/server/src/features/chat/` is split so that each file has **one reason to change**:

| File | Its one job | Change it when… |
| --- | --- | --- |
| `chatService.ts` | Runs the steps below in order (about 20 lines) | the order of the big steps changes |
| `turn.ts` | Loads settings and refuses blocked or over-limit visitors | you change who may chat |
| `sessionLimits.ts` | The message limits (burst and per-window) | you change the limits |
| `fastPath.ts` | The cheap ways to answer: a **list** of stages | you add, remove or reorder a stage |
| `answerPipelineStages.ts` | How each individual stage works | one stage's behavior changes |
| `knowledgeRetrieval.ts` | Searches your content; handles long chats and follow-ups | how searching works |
| `answerGeneration.ts` | Asks the AI and tidies the answer | how the AI is called |
| `noAnswer.ts` | What to do when the AI can't or shouldn't answer | the fallback or "no answer" behavior |
| `rememberAnswer.ts` | What is saved for next time (caches, auto-saved Question Chunks) | what is remembered |

The files pass one object between them (the `Turn`), so nothing reads settings twice or re-derives the same facts.

## Where things are — server

Every feature has its own folder. Everything about it is inside:

```
apps/server/src/features/faqs/
  faqs.routes.ts     the URLs, and the permission each one needs
  faqs.handlers.ts   reads the request, checks it, sends the reply
  faqs.queries.ts    ALL the database queries for this feature
```

A simple rule: **handlers talk to the web, queries talk to the database, and neither does the other's job.**

Other places worth knowing:

| Where | What |
| --- | --- |
| `src/routes/index.ts` | The list of all features — add one line here for a new feature |
| `src/shared/` | Types and the permission list, shared with the admin panel |
| `src/providers/` | The AI, voice and embedding services, one file each |
| `src/middleware/` | Permission checks, the audit log, error handling |
| `src/utils/` | Small helpers |
| `db/migrations/` | Numbered database changes. They run every time, so each must be safe to run twice |
| `tests/` | Tests, laid out exactly like `src/` |

## Where things are — admin panel

| Where | What |
| --- | --- |
| `src/routes.tsx` | Every page, in one list. The menu is built from it |
| `src/pages/` | One file per page |
| `src/components/ui/` | Ready-made buttons, cards, tables and pop-ups — use these |
| `src/lib/api.ts` | The only place that calls the server |
| `src/lib/authContext.tsx` | Who is signed in and what they may do |
| `src/shared/` | A copy of the server's `src/shared/` |

## Where things are — widget

`src/core/chatWidgetController.ts` is the chat itself. Two features live in their own classes, each with a small interface back to the chat: `voiceChat.ts` (the voice conversation — [how it works](VOICE.md)) and `visitorAuth.ts` (visitor sign-up and login). Also, `src/services/` talks to the server, `src/ui/` draws the window, `src/widget.css` is the look.

## Who can do what (permissions)

Permissions have names like `faqs.edit` or `settings.view`. The server checks them on **every** request, and it reads them fresh from the database, so taking someone's access away works immediately. The admin panel only hides buttons as a courtesy — hiding is never the real protection.

To add a permission or protect something new:

1. Add it to `apps/server/src/shared/permissions.ts`.
2. Put it on the route: `permission: 'invoices.delete'`. The code won't compile if a route has none.
3. In the admin panel, use `can('invoices.delete')` to show or hide the button.

Every admin request goes through the same checks:

```
 Request from the admin panel
          |
          v
 Signed in?          --no--> reply 401: please sign in
          | yes
          v
 Does the role have the permission this URL needs?
                     --no--> reply 403: not allowed
          | yes
          v
 Do the work  -->  write to the audit log
```

Roles are just named groups of permissions. Admins create them in the panel (Access Control → Roles). Nobody can give a role a permission they don't have themselves.

## Add a new feature (example: "Invoices")

```
 1 Database table  ->  2 Permissions  ->  3 Queries  ->  4 Handlers
   ->  5 Routes (+ one line in routes/index.ts)
   ->  6 Admin: api.ts  ->  7 Admin: page (+ one line in routes.tsx)
```

**Server**
1. `db/migrations/00NN_invoices.sql` — create the table (use `if not exists`).
2. `src/shared/permissions.ts` — add the `invoices` permissions.
3. `src/shared/types.ts` and `apiRoutes.ts` — describe the data and the URL.
4. `src/features/invoices/invoices.queries.ts` — the database queries.
5. `src/features/invoices/invoices.handlers.ts` — check the request, call the queries, reply. For expected problems use `throw new HttpError(404, 'Not found')`.
6. `src/features/invoices/invoices.routes.ts` — the URLs with their permissions.
7. `src/routes/index.ts` — add one line.
8. `tests/features/invoices/` — add tests.

**Admin panel**
1. Copy `apps/server/src/shared/` into `apps/admin/src/shared/`.
2. `src/lib/api.ts` — add the calls.
3. `src/pages/Invoices.tsx` — build the page from `components/ui/`.
4. `src/routes.tsx` — add one line. The menu and the page protection follow automatically.

You don't need to change anything else.

## Add a new AI, voice or embedding service

1. Add a file in the matching `src/providers/` folder, copying an existing one.
2. Add it to that folder's `index.ts`.
3. Add its key to `src/config/env.ts` and `.env.example`.

## Add a new answer stage

1. Write how it works as a `tryX` function in `apps/server/src/features/chat/answerPipelineStages.ts`.
2. In `fastPath.ts`, describe it as one entry (`{ name, run }` for a stage that needs only the message, or `{ name, start, answer }` for one that compares meaning) and add it to the right list. **That is the only place that decides the order.**

You never need to touch `chatService.ts`, the AI call, or the fallbacks.

## The design rules (why changes stay small)

These are the habits that keep a change from rippling through the whole project. Follow them when you add code.

1. **One file, one job.** If you can't say what a file does in one short sentence, split it. (The chat code and the settings handlers were once single 500-line files; each is now several small ones.)
2. **Add by adding, not by editing.** New things go in as a new entry in a list, not as new `if` branches in old code: a new answer stage is one line in `fastPath.ts`, a new page is one line in `routes.tsx`, a new feature is one line in `routes/index.ts`, a new AI service is one file plus one line in its registry.
3. **Depend on the idea, not the vendor.** Code talks to "an AI provider" or "the database queries", never to one specific vendor. That's why the AI, speech and embedding services can be swapped.
4. **Pass one object, don't re-fetch.** A chat message builds one `Turn` up front and hands it along, so no step loads settings again or re-works out the same facts.
5. **Small, honest interfaces.** A stage needs only a name and one or two functions. Don't add layers or patterns "just in case".
6. **Tests protect the behavior.** Before reshaping code, run `npm test`; after, run it again. They should be identical.

## Rules to follow

- **Keep `shared/` identical.** `apps/server/src/shared/` and `apps/admin/src/shared/` must match. After changing one, copy it over.
- **Check input** with zod in the handler. Validation mistakes then become a clear "400" reply automatically.
- **Never fetch a web address typed by a user directly.** Use `utils/safeFetch.ts`, which blocks internal addresses.
- **Never put passwords or keys in logs.**
- **Don't make the visitor wait** for work they don't need. Do it in the background.
- **Keep the server near its database.** Each chat message makes about 25 database queries, so distance adds delay.

## Speed — what was measured and what we did about it

Numbers come from measuring the real app, not from guessing.

| What was slow | What we do |
| --- | --- |
| Every database question crosses the network (about 145 ms each when the database is in another region) | Keep the server and the database in the **same region**. Run independent queries **at the same time**, not one after another |
| The first message after a short pause waited about 1 s to reconnect to the database, and the search index had gone cold (50–120 ms instead of 0.5 ms) | `db/pool.ts` keeps connections open for 10 minutes and pings them, and the search indexes, every 30 s |
| The AI call (usually 1.5 s, sometimes 5–10 s) | A fast default model, a backup model that starts alongside it after 2 s, no hidden "thinking" |
| Follow-up questions made an extra AI call before the real one | That call is cut off after 1.2 s; the search then uses the previous question plus this one |
| Searching content by keyword read every chunk | Trigram indexes (migration `0010`); chat lookups are indexed in `0009` |
| Waiting on work the visitor doesn't need | Saving the chat and the caches happens after the answer is sent |

Repeat questions are the fastest: an exact repeat comes back in well under a second, because the answer is already in a cache.

## Debugging

See [`understand/03-debugging.md`](understand/03-debugging.md).
