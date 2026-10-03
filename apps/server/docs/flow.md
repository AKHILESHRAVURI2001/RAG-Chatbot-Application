# Server — code flow

How `@minichatbot/server` (Express + TypeScript + Postgres `pgvector` + optional Redis) starts, handles a request, answers a question and ingests content. For where files live and how to add to them, see [`../../../docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md).

---

## 1. Boot (`src/index.ts`)

```mermaid
sequenceDiagram
    autonumber
    participant Boot as src/index.ts
    participant Env as config/env.ts
    participant DB as db/pool.ts
    participant Settings as settings.queries.ts
    participant Caches as In-memory caches
    participant Express as Express app

    Boot->>Env: validate .env with zod (exits on bad config)
    Boot->>Express: security headers, CORS, gzip compression, JSON body (2 MB), /widget.js, /api
    Boot->>DB: ensureDbSchema() — apply db/schema.sql (non-fatal on failure)
    Boot->>Settings: load admin-set API keys, Firebase, speech and embedding keys
    Settings-->>Caches: populate the key/credential caches
    Boot->>Boot: warm up the local embedding model (in the background)
    Boot->>Express: listen on PORT (default 4000)
```

Migrations in `db/migrations/` are applied separately with `npm run migrate` (or the admin panel's Database tab).

---

## 2. Request routing, authentication and permissions

```mermaid
flowchart TD
    Req[HTTP request] --> Mw[Headers → CORS → gzip → JSON body]
    Mw --> Path{Path}
    Path -- /widget.js --> Widget[Serve the widget bundle]
    Path -- /api/health --> Health["{ ok: true }"]
    Path -- /api/chat/* --> Chat[Public chat router]
    Path -- /api/auth/login --> Login[Rate-limited login]
    Path -- /api/auth/me and /api/admin/* --> Authn[authenticate]

    Authn -- no / invalid token, or account gone --> R401[401]
    Authn -- ok: load account + role + permissions from the DB --> Audit[auditAction — opens an audit entry]
    Audit --> Perm[requirePermission — the route's declared permission]
    Perm -- missing --> R403[403 generic message]
    Perm -- held --> Handler[Handler: zod validation → service / repo → response]

    Chat --> Handler
    Handler --> Err[errorHandler]
    R403 --> Done[Audit entry written when the response finishes]
    Handler --> Done
```

- **Authentication** (`features/auth/authMiddleware.ts`) proves who the caller is. The token holds identity only; the account, role and permissions are read from the database **on every request**, so changing a role or deleting an account takes effect immediately. Admin tokens carry audience `admin`, visitor tokens `visitor`, so one can never be used as the other.
- **Authorization** is `requirePermission(...)`, added by `registerSecuredRoutes` from the `permission` declared on each route. A route without one doesn't compile.
- **Audit** entries record who did what and the outcome (denied attempts included); request bodies are never logged.
- **Errors** become responses in `middleware/errorHandler.ts`: `HttpError` → its status, `ZodError` → 400, anything else → logged and a generic 500 in production.

---

## 3. Answering a question (`chatService.ts` → `answerQuestion`)

`answerQuestion` is a short coordinator: `startTurn` (turn.ts) → `tryFastPath` (fastPath.ts) → `retrieveKnowledge` (knowledgeRetrieval.ts) → `generateAnswer` (answerGeneration.ts), with `noAnswer.ts` handling the cases where the AI can't answer and `rememberAnswer.ts` saving what is worth keeping. The diagram below shows what happens across those steps.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Handler as chat.handlers.ts
    participant Svc as chatService.ts
    participant Stages as answerPipelineStages.ts
    participant DB as Postgres
    participant LLM as providers/llm

    Client->>Handler: POST /api/chat { sessionId, message, documentId?, tag? }
    Handler->>Handler: validate, identify visitor, widget availability, login gate / limits
    Handler->>Svc: answerQuestion(sessionId, message, opts)
    Svc->>DB: find/create conversation + settings (in parallel)
    Svc->>Svc: blocked? quota check ∥ read recent history
    Svc-->>DB: save the user message (background)
    Svc->>Stages: 0 restricted words
    Svc->>Stages: 1 exact cache (Redis / memory)
    Svc->>Svc: greeting shortcut
    Svc->>Svc: embed the question (local model)
    Svc->>Stages: 2 FAQ → 3 question chunks → 4 semantic cache
    alt a stage hits
        Stages-->>Svc: answer + source (faq / chunk / cache / restricted)
    else all miss
        Svc->>Svc: compact history, rewrite follow-up query if needed
        Svc->>DB: vector search of document chunks
        alt nothing relevant
            Svc-->>Svc: "no context" reply, record as an unanswered question
        else context found
            Svc->>LLM: generateAnswer(system prompt, context, history)
            LLM-->>Svc: answer (on failure: related-content fallback)
            Svc-->>DB: cache + auto-store question chunk (background)
        end
    end
    Svc-->>DB: save the assistant message (background, after the user message)
    Svc-->>Handler: { answer, source, conversationId }
    Handler-->>Client: 200 JSON
```

Sources reported to the widget: `faq`, `chunk`, `cache`, `restricted`, `llm`, `chunk-fallback`, `no-match`.

**Latency design.** Work the visitor doesn't need before the answer (saving the transcript, cache writes, Firebase mirroring) runs in the background with failures logged. Small, rarely-changing reads (restricted words, the FAQ list used for typo matching) are cached for 30 s in `utils/ttlCache.ts` and dropped on any write. The slowest step is almost always the LLM call: the Gemini provider disables model "thinking", gives each model a 10 s budget and fails over to the next.

---

## 4. Content ingestion (`ingestionService.ts`)

```mermaid
flowchart TD
    Start[Admin adds a URL / sitemap / file / text] --> Routes[documents.routes.ts — needs documents.create]
    Routes --> Ingest[ingestionService: ingestUrl / ingestFile / ingestText]
    Ingest --> Type{Source}
    Type -- URL --> Url["urlLoader: assertPublicHttpUrl → safeFetch → cheerio text"]
    Type -- Sitemap --> Site["sitemapLoader: safeFetch → page URLs"]
    Type -- File --> File[fileLoader: PDF, DOCX, CSV, TXT, MD, JSON, HTML…]
    Type -- Text --> Raw[Pasted text]
    Url & File & Raw --> Chunk[chunker: word chunks with overlap, from Settings]
    Chunk --> Embed[embedBatch → 384-d vectors]
    Embed --> Store[documents.queries: insert documents + chunks]
    Store --> Flush[Flush answer caches so stale answers disappear]
    Flush --> Done[Document status 'ready']
```

URL and sitemap fetching never reaches private or internal addresses (checked on every redirect hop) unless `ALLOW_PRIVATE_URL_FETCH=true`.

---

## 5. Where to look

| Task | File |
|---|---|
| Boot, middleware, `/widget.js` | `src/index.ts` |
| Every mounted router | `src/routes/index.ts` |
| Defining or requiring a permission | `src/shared/permissions.ts`, `src/utils/registerRoutes.ts` |
| Who is the caller / what may they do | `src/features/auth/authMiddleware.ts`, `authorization.ts` |
| The answer pipeline | `src/features/chat/chatService.ts` (coordinator), `fastPath.ts` (the stage list), `answerPipelineStages.ts` (each stage) |
| Public chat endpoints | `src/features/chat/chat.routes.ts`, `chat.handlers.ts` |
| Ingestion | `src/features/documents/ingestionService.ts` |
| LLM / speech / embedding vendors | `src/providers/{llm,speech,embedding}/` |
| Caching (Redis + memory fallback) | `src/cache/redis.ts` |
| Optional Firestore mirror | `src/features/reports/firebaseMirror.ts` |
| Audit log | `src/features/audit/` |
