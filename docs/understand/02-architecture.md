# 02 — How the pieces fit together

A map you can come back to after the [learning path](01-learning-path.md). It explains how things are organized and **why**, not every line of code. For the full reference (and the file-by-file tables), see [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## The three apps

![The three parts](../images/overview.svg)

| App | What it is | Talks to |
| --- | --- | --- |
| `apps/server` | The brain. Stores content, finds answers, calls the AI, decides who may do what | The database, Redis (optional), the AI and speech services |
| `apps/admin` | The website you use to run the bot | The server only |
| `apps/widget` | The chat bubble on your website (one `widget.js` file) | The server only |

The admin panel and the widget **never** talk to each other or to the database. Everything goes through the server.

## How a question is answered

![How a question is answered](../images/question-flow.svg)

The server tries the cheapest option first and stops at the first one that works. The code is `apps/server/src/features/chat/`, split into small files that each do one job (`turn.ts`, `fastPath.ts`, `knowledgeRetrieval.ts`, `answerGeneration.ts`, `noAnswer.ts`, `rememberAnswer.ts`).

## The habits the server follows

Once you've seen one example of each, you've seen them all.

### 1. A feature is one folder

```
apps/server/src/features/faqs/
  faqs.routes.ts     the URLs, and the permission each one needs
  faqs.handlers.ts   reads the request, checks it, sends the reply
  faqs.queries.ts    ALL the database queries for FAQs
```

**Handlers talk to the web. Queries talk to the database. Neither does the other's job.** If you want to see every SQL query a feature runs, there is exactly one place to look.

### 2. Every admin URL names the permission it needs

```ts
{ method: 'delete', path: '/:id', permission: 'faqs.delete', handler: handleDeleteFaq }
```

The code won't compile if a route has no permission. The server checks it on **every** request. Hiding a button in the admin panel is only a courtesy, never the real protection.

### 3. Services that can be swapped follow one pattern

`src/providers/` has three folders — `llm/` (the chat AI), `speech/` and `embedding/`. Each has:

- `provider.ts` — the list of things every vendor must be able to do
- one file per vendor (`gemini.ts`, `openai.ts`, `sarvam.ts`, …)
- `index.ts` — a registry that picks the right one by name

Nothing else in the code says "if the vendor is X". That's why the admin panel can switch vendors with a dropdown.

### 4. Tests mirror the code

`apps/server/tests/` has the same folder layout as `src/`. A test for `src/features/faqs/faqService.ts` lives at `tests/features/faqs/faqService.test.ts`. No test files sit inside `src/`.

### 5. Shared types are copied by hand

`apps/server/src/shared/` and `apps/admin/src/shared/` must stay **identical**. They hold the types, the list of URLs and the list of permissions. After you edit one, copy it to the other. (The widget has its own smaller set.)

## The admin panel's habits

- **`src/routes.tsx`** lists every page — its address, menu label, icon and the permission it needs. The menu and the page protection are both built from this one list.
- **`src/lib/api.ts`** is the **only** place that calls the server.
- **`src/components/ui/`** holds the ready-made parts (buttons, cards, tables, pop-ups). Build new screens from these.
- **`src/lib/authContext.tsx`** knows who is signed in and what they may do, so a page can ask `can('faqs.edit')`.

## The widget's habits

`src/core/chatWidgetController.ts` is the chat. Voice (`voiceChat.ts`) and visitor sign-in (`visitorAuth.ts`) are separate classes that talk to the chat through a small list of what they need. The widget has no `.env` file: its settings come from the `<script>` tag and from the server.

## Quick file map

| I want to understand… | Open this |
| --- | --- |
| The whole answer flow | `apps/server/src/features/chat/chatService.ts` (short — it calls the rest) |
| The list of cheap answer stages | `apps/server/src/features/chat/fastPath.ts` |
| How a document gets added | `apps/server/src/features/documents/ingestionService.ts` |
| Which AI / speech services exist | `apps/server/src/providers/{llm,speech,embedding}/index.ts` |
| Every URL the server has | `apps/server/src/routes/index.ts` and each feature's `*.routes.ts` |
| Who may do what | `apps/server/src/shared/permissions.ts` |
| Any database query | `apps/server/src/features/<feature>/<feature>.queries.ts` |
| Every page in the admin panel | `apps/admin/src/routes.tsx` |
| Every call the admin makes | `apps/admin/src/lib/api.ts` |
| How voice works | [`../VOICE.md`](../VOICE.md) |

---

Next: [`03-debugging.md`](03-debugging.md) to watch the code run line by line, or [`04-extending.md`](04-extending.md) to add something of your own.
