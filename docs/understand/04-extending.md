# 04 — Adding and changing things

Step-by-step recipes for adding something new **without breaking the way the project is organized**. The reasons behind these steps are in [`02-architecture.md`](02-architecture.md).

## Before you change anything

1. Run the tests so you know they pass: `npm test`
2. Make your change.
3. Run the tests again. If you only reshaped code, the results must be the same.

## Add a whole new feature (example: "Invoices")

**On the server**

1. `apps/server/db/migrations/00NN_invoices.sql` — create the table. Use `create table if not exists`, because migrations run every time.
2. `apps/server/src/shared/permissions.ts` — add an `invoices` entry with its actions (view, create, edit, delete…). The Roles screen shows it automatically.
3. `apps/server/src/shared/types.ts` and `apiRoutes.ts` — describe the data and the URL.
4. `apps/server/src/features/invoices/invoices.queries.ts` — the database queries.
5. `…/invoices.handlers.ts` — check the request, call the queries, send the reply. For an expected problem, `throw new HttpError(404, 'Not found')`.
6. `…/invoices.routes.ts` — the URLs, each with its `permission`.
7. `apps/server/src/routes/index.ts` — add **one line** to mount the router.
8. `apps/server/tests/features/invoices/` — tests, in the same layout.

**In the admin panel**

1. Copy `apps/server/src/shared/` into `apps/admin/src/shared/`.
2. `apps/admin/src/lib/api.ts` — add the calls.
3. `apps/admin/src/pages/Invoices.tsx` — build the page from `components/ui/`. Wrap buttons in `can('invoices.delete')`.
4. `apps/admin/src/routes.tsx` — add **one line**. The menu and the page protection follow automatically.

You don't need to change anything else.

## Add a new AI, voice or embedding service

All three kinds work the same way (`apps/server/src/providers/{llm,speech,embedding}/`):

1. Make a new file, copying an existing one as a template — for example `llm/mistral.ts`.
2. Add it to that folder's `index.ts` registry.
3. Add its API key to `apps/server/src/config/env.ts` and `.env.example`.

The admin panel's dropdowns pick it up on their own.

## Add a new way of answering (a new stage)

1. Write how it works as a `tryX` function in `apps/server/src/features/chat/answerPipelineStages.ts`.
2. In `fastPath.ts`, add one entry to the stage list. **That list is the only thing that decides the order.**

You never touch `chatService.ts`, the AI call or the fallbacks.

## Add a new permission

1. Add it to `apps/server/src/shared/permissions.ts`.
2. Put it on the route: `permission: 'invoices.export'`.
3. In the admin panel, use `can('invoices.export')` to show or hide the button.

Admins can then give it to any role in Access Control → Roles.

## Add a test

Put it at the same path as the file it tests, under `apps/server/tests/`. For `src/features/faqs/faqService.ts`, the test is `tests/features/faqs/faqService.test.ts`. Run all tests with `npm test`.

## Change a shared type

Edit it in `apps/server/src/shared/`, then copy the file to `apps/admin/src/shared/`. They must stay identical. (`diff -rq` between the two folders should print nothing.) The widget has its own smaller set — only touch it if the widget needs the new field.

## Things that would be good to add next

- **More document sources** (Notion, Confluence, Google Docs). `features/documents/` has separate loaders for files, URLs and sitemaps. With a fourth or fifth source, give them one shared list like the AI services have.
- **A new dashboard number.** `apps/server/src/features/stats/` and `apps/admin/src/pages/Dashboard.tsx` are the pair to look at.
- **Streaming answers** so text appears while the AI is still writing — the biggest remaining speed-up for brand-new questions.
- **A linter and formatter** (ESLint and Prettier) shared across the three apps. There isn't one yet.

## Rules to remember

- Keep `shared/` identical in the server and the admin panel.
- Never fetch a web address that a user typed directly — use `utils/safeFetch.ts`.
- Never put passwords or keys in logs.
- Don't make the visitor wait for work they don't need. Do it after the answer is sent.
- Keep the server in the same region as its database.

---

Back to the [guide index](README.md).
