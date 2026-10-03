# Learning path

One thing at a time, in order. Don't skip ahead — each step builds on the last.

**Total estimate: ~10–14 hours**, assuming you already know a little JavaScript. Spread it across several 45–60 minute sessions, not one sitting.

---

## Step 1 — See it run (30 min)

Before reading any code, use the app like a visitor. Run `start.bat` (or `npm run dev:server` / `npm run dev:admin` / `npm run dev:widget` separately), open the admin panel, add one FAQ, embed the widget on a test page, and ask it that FAQ's question. Watch the answer come back.

You now know *what* the code needs to do, before seeing *how*.

## Step 2 — The shape of the project (30 min)

Open the project [`README.md`](../../README.md), then [`ARCHITECTURE.md`](../ARCHITECTURE.md). Read the "Project layout" tree, the mermaid diagram in "How a question gets answered" and the "Server — where things live" section. Don't open any `.ts` file yet.

Goal: know there are 3 apps (server, admin, widget), and that a question flows through several cheap stages before it ever reaches an AI model.

## Step 3 — Every URL the backend has (20 min)

Open `apps/server/src/routes/index.ts`. It's short — read it top to bottom. It's literally a list of "when a request comes to this URL, send it to this file." Then open one of the `*.routes.ts` files it mentions and notice each URL names the **permission** it needs. Don't open the handlers yet.

Goal: understand that routes are just traffic directors.

## Step 4 — The single most important file (60–90 min, go slow)

Open `apps/server/src/features/chat/chatService.ts`. Read the function `answerQuestion` top to bottom. You won't understand every line — that's fine. Just track the shape: restricted words → exact cache → FAQs → question chunks → semantic cache → finally the AI. Write down, in plain English, what each stage is for before moving on.

## Step 5 — The cache/match stages, one at a time (45 min)

Open `apps/server/src/features/chat/answerPipelineStages.ts`. Each `try…` function here matches one stage from Step 4. Read one function, then scroll back to `chatService.ts` and find where it's called. Repeat for each stage.

## Step 6 — How the HTTP layer around it is organized (30 min)

Open `apps/server/src/features/chat/chat.routes.ts` — this is what actually receives the visitor's request before `chatService.ts` runs. Notice it only receives the request and hands over: the handler (`chat.handlers.ts`) validates input → checks who's asking (`chatRequestAuth.ts`) → checks they're allowed to ask (`chatAccessControl.ts`) → calls `answerQuestion` → responds. Open those two small helper files too; each does exactly one job.

## Step 7 — How text becomes a vector (30 min)

Open `apps/server/src/providers/embedding/resolve.ts`. Just the function `embedText`. You don't need the math — accept "text goes in, a list of numbers comes out," and that similar sentences produce similar numbers.

## Step 8 — How content gets into the system (45 min)

Open `apps/server/src/features/documents/ingestionService.ts`. This runs when you add a URL/PDF/text in the admin panel. Trace one path only — pick "add text," it's simplest — from `ingestText` through to where it gets chunked (`chunker.ts`) and embedded.

## Step 9 — Rest, then re-do Steps 4–8 from memory (30 min)

Close everything. Describe the whole flow — visitor types a question → answer appears — without looking at code. Then reopen the files to check where you got stuck. This is the step that actually makes it stick.

## Step 10 — The admin panel (60 min)

Open `apps/admin/src/routes.tsx` first (every page and the permission it needs), then `apps/admin/src/lib/api.ts` (skim it — every backend call the admin makes, in one file). Then open `apps/admin/src/pages/Documents.tsx` and match what you see in the UI to the functions calling `api.ingestUrl`, `api.ingestFile`, etc.

## Step 11 — The widget (60–90 min)

Open `apps/widget/src/core/chatWidgetController.ts`. No React here — plain JavaScript managing a whole UI by hand. Find where a message gets sent (search for `sendMessage`) and follow it to `widgetApi.ts`.

## Step 12 — Close the loop (45 min)

Ask the widget a real question, then go to Admin → Chat Logs and find that exact conversation. You'll see the full prompt sent to the AI, which cache tier answered it, and the retrieved chunks — tying every earlier step into one real example you generated yourself.

---

Next: [`02-architecture.md`](02-architecture.md) for the map of everything you just walked through, then [`03-debugging.md`](03-debugging.md) to step through it line by line, and [`04-extending.md`](04-extending.md) to add something of your own.
