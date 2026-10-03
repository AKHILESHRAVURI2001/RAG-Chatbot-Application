# Contributing

Thanks for wanting to help. This guide is short on purpose.

## Get it running

```bash
git clone https://github.com/AKHILESHRAVURI2001/RAG-Chatbot-Application.git
cd RAG-Chatbot-Application
npm install
cp apps/server/.env.example apps/server/.env      # then fill it in
cp apps/admin/.env.example apps/admin/.env
npm run db:migrate
npm run dev:server    # and in other terminals: npm run dev:admin, npm run dev:widget
```

The full steps are in the [README](README.md). To learn how the code is organized, read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — it also has step-by-step recipes for adding a feature, an AI service or a permission.

## Before you open a pull request

1. **Run the tests:** `npm test` — they must pass.
2. **Run the build:** `npm run build` — it must succeed.
3. **Keep `apps/server/src/shared/` and `apps/admin/src/shared/` identical.** If you change one, copy it to the other. (`diff -r apps/server/src/shared apps/admin/src/shared` should print nothing.)
4. **Add a test** for new behavior, in `apps/server/tests/`, in the same layout as the code.
5. **Never commit secrets.** No `.env` files, keys, tokens or passwords — not even in tests or docs.

## How we like the code

- **One file, one job.** If you can't say what a file does in one sentence, split it.
- **Add by adding.** A new feature, page, permission or AI service should be one new file plus one line in a list, not edits scattered through old code.
- **Check on the server.** Every admin route declares the permission it needs. Hiding a button is a courtesy, not security.
- **Keep it simple.** Don't add layers or patterns "just in case".

## Reporting problems

- **Bug or idea:** open an issue and describe what you expected and what happened.
- **Security problem:** don't open an issue — follow [`SECURITY.md`](SECURITY.md).
