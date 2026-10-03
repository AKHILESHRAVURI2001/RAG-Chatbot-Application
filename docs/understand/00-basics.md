# The basics — read this first if you're new to programming

Everything here is explained using this actual project as the example, not made-up examples. Take your time — this file alone might take 2–3 hours if it's genuinely all new to you, and that's completely normal.

## What is "code," really?

Code is just written instructions, in a very strict language, that tell a computer exactly what to do, step by step. A computer cannot guess what you mean — every instruction has to be spelled out. That's the whole job of programming: breaking "answer the visitor's question" down into hundreds of tiny, exact steps like "take this text," "turn it into numbers," "compare it to these other numbers," "pick the closest match."

## What is a "server"?

A **server** is just a program that sits there, running all the time, waiting for messages to arrive, and sending a reply back for each one. That's it — a program that waits and replies.

In this project, `apps/server` is exactly that. When you run `npm run dev:server`, a program starts up and just... waits. It doesn't do anything until someone sends it a message.

## What is a "client"?

A **client** is anything that sends a message to a server and waits for the reply. In this project, there are two clients:
- The **admin panel** (`apps/admin`) — the dashboard you use in your browser.
- The **widget** (`apps/widget`) — the chat bubble embedded on a website.

Both of them are just programs that ask the server questions like "what are the current settings?" or "here's a visitor's question, what should I answer?" — and then display whatever the server sends back.

## What is an "API"?

An API is just the **agreed-upon list of questions a server will answer**, and what shape the reply will be. Think of it like a restaurant menu: you can't ask the kitchen for anything you want, you can only order what's on the menu, worded exactly how the menu says.

Open `apps/server/src/shared/apiRoutes.ts` right now — that entire file *is* the menu. Every line like `voice: '/chat/voice'` is one "thing you're allowed to ask the server for."

## What is "HTTP" and a "request/response"?

HTTP is the actual language clients and servers use to talk to each other over the internet (or over `localhost` when everything's running on your own machine). Every single conversation is exactly two messages:

1. A **request** — the client says "I want this" (e.g. "answer this question: *how much does it cost?*").
2. A **response** — the server says "here's your answer" (e.g. `{"answer": "It costs $10/month."}`).

That's genuinely the entire pattern, repeated for everything the app does. When you see `res.json({...})` anywhere in `apps/server/src`, that line is the server writing its response.

## What is JSON?

JSON is just a plain-text way of writing structured information — objects with named fields — that both humans and computers can read easily. It looks like this:

```json
{ "answer": "It costs $10/month.", "source": "faq" }
```

That's an object with two fields: `answer` and `source`. Nearly everything sent between the client and server in this project is JSON.

## What is a "database," and what is Postgres?

A database is a program whose only job is to **store information permanently** and let you ask for it back later, even after the server restarts. Without one, everything the bot "knows" would disappear every time you restarted the server.

**Postgres** (also called PostgreSQL) is the specific database this project uses. It organizes information into **tables** — think of a table like a spreadsheet: rows and columns. This project has tables like `documents` (every piece of content you've fed the bot), `conversations` (every chat session), and `messages` (every individual message sent).

**SQL** is the language you write to ask a database questions, like "give me every document tagged `pricing`." In this project each feature keeps its own SQL in a `*.queries.ts` file inside its folder (for example `apps/server/src/features/faqs/faqs.queries.ts`) — nothing else talks to the database.

## What is `pgvector` / a "vector," in plain terms?

A **vector** here just means: a list of numbers that represents the *meaning* of a piece of text. Two sentences that mean similar things end up with similar lists of numbers, even if they don't share a single word in common (e.g. "How much does it cost?" and "What's the price?" produce very similar number-lists).

`pgvector` is an add-on for Postgres that lets it store these number-lists and quickly find "which stored pieces of text have numbers closest to this new question's numbers" — that's the actual mechanism behind "the bot searches your knowledge base."

## What is a variable, a function, and "async"?

- A **variable** is just a named box holding a value. `const sessionId = "abc123"` means: make a box named `sessionId`, put `"abc123"` in it.
- A **function** is a named, reusable block of instructions. `answerQuestion(sessionId, message)` means: run the set of steps called `answerQuestion`, handing it two values to work with.
- **`async`** and **`await`**: some steps take time — asking a database for something, or asking an AI model to think, might take a few hundred milliseconds. `async`/`await` is just the way this language says "wait here until this slow step finishes before doing the next line." Without it, the code would try to use an answer before it had actually arrived.

## What is TypeScript, and how is it different from JavaScript?

JavaScript is the actual language browsers and Node.js run. TypeScript is JavaScript **plus a system that checks your code makes sense before you even run it** — e.g. it'll refuse to let you treat a piece of text as if it were a number. Every `.ts` file in this project is TypeScript; it gets converted to plain JavaScript before it actually runs (see the note on `src/` vs `dist/` below).

## What is `npm`, and what does "installing a package" mean?

Nobody writes everything from scratch. A **package** is a chunk of code someone else already wrote and published, that you can pull into your own project instead of rewriting it yourself (e.g. this project uses a package called `express` to handle the "server waits and replies" part, instead of writing that from zero).

`npm` (Node Package Manager) is the tool that downloads packages you need and keeps track of exactly which ones and which versions your project depends on (that list lives in each `package.json` file). Running `npm install` reads that list and downloads everything into a folder called `node_modules` (which is why that folder is never part of the actual code you write or read).

## What is `src/` vs `dist/`?

- **`src/`** — the code you actually write and read. TypeScript, not runnable directly by a browser or plain Node.
- **`dist/`** — "distribution," the compiled/bundled output, regenerated automatically from `src/` every time you build. You never edit this by hand.

(There's a fuller explanation of exactly how and when this update happens for each of the three apps if you ask about it directly — it differs slightly between the server, admin, and widget.)

## What is Git / GitHub, briefly?

**Git** tracks every change ever made to the project's files, so nothing is ever truly lost and you can see exactly what changed and when. **GitHub** is a website that hosts a copy of that history online, so you can share the project, and others can see (or contribute to) it.

## What now?

You don't need to memorize any of this — just recognize the words when you see them. Move on to [`01-learning-path.md`](01-learning-path.md) and start Step 1. Whenever you hit a term you don't recognize while reading code, come back here first before asking — there's a good chance it's already explained above.
