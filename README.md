# Komi

**English** · [Tiếng Việt](README.vi.md)

A real-time team chat app (Messenger-style) with an AI assistant, **Komi AI**, that answers questions from your chat history, files shared in chat, and a shared document library — and only ever reads what the person asking is allowed to see.

**Live demo:** https://komi-nz7y.onrender.com — click **"Điền tài khoản demo"** (fill demo account) on the login page, or sign in as `an.nguyen` / `komi123`.
Free hosting: the first visit after 15 minutes of inactivity takes about a minute to wake up. The UI and demo data are in Vietnamese.

## Features

**Chat**
- 1-1 and group chats, friends, online status, read receipts, unread counts
- Optimistic sending with retry, infinite scroll history, image and PDF/Word attachments
- Accent-insensitive message search within a conversation (Vietnamese)

**Komi AI**
- Private chat with the bot, or mention `@komi` in a group; answers stream over Socket.IO with a stop button
- "What did I miss?" — summarizes unread messages of a conversation
- Q&A over the latest file in the conversation (PDF/DOCX), citing file and page
- Retrieval (RAG) over chat history and the shared document library, **filtered by the asker's permissions inside the vector query**, with sources cited in the answer
- Per-user and app-wide daily quotas; every LLM/embedding call logged with token counts on an admin page (`/admin/ai-usage`)
- Prompt-injection hardening, measured with an adversarial test set (see [Evaluation](#evaluation))

## Architecture

```mermaid
flowchart LR
    subgraph Client
        FE["React 19 + Zustand<br/>(Vite, Tailwind, shadcn/ui)"]
    end

    subgraph Backend["Node.js backend (Express 5 + Socket.IO)"]
        API["REST API<br/>auth · chat · files · documents"]
        WS["Socket.IO<br/>messages · ai:token / ai:done"]
        AUTHZ{{"membership check<br/>requireConversationMember / userIsMemberOf"}}
        BOT["Komi AI<br/>prompt · quota · streaming"]
        RAG["RAG search<br/>$vectorSearch + permission filter"]
        WORKER["background indexer<br/>chunk → embed (rate-limited)"]
        PROV["LLMProvider / EmbeddingProvider<br/>OpenAI-compatible · fake for tests"]
    end

    DB[("MongoDB Atlas<br/>data + vector index")]
    CDN[("Cloudinary<br/>images, PDF/DOCX")]
    LLM["Gemini API<br/>(free tier)"]

    FE -- "HTTP (JWT + refresh cookie)" --> API
    FE <-- WebSocket --> WS
    API --> AUTHZ
    WS --> AUTHZ
    AUTHZ --> BOT
    BOT --> RAG
    BOT --> PROV
    RAG --> DB
    WORKER --> DB
    WORKER --> PROV
    PROV --> LLM
    API --> DB
    API --> CDN
```

How a question to Komi AI is answered:

1. The message goes through the same membership check as any chat message (outsiders get **404**, not 403, so a conversation's existence isn't leaked).
2. The quota is charged (per user, then app-wide).
3. The question is embedded and searched with `$vectorSearch`, filtered to `conversationId ∈ {conversations the asker may read}` plus the shared library. In a group, only that group + the library; in a private chat with Komi, all of the asker's conversations + the library.
4. Top 6 chunks (≤ ~8,000 chars) go into the prompt as a labelled **data block** in the user turn, together with recent messages and the latest file. The system prompt says only the asker can give instructions; everything else is data.
5. The answer streams back token by token via Socket.IO and is saved as a normal message from the bot user.

A background worker (no Redis/queue) groups ≤10 consecutive messages into a chunk, splits files into ~1,000-char chunks per page, and embeds them under the free-tier rate limit (100 chunks/min).

## Tech stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Zustand, Tailwind 4, shadcn/ui |
| Backend | Node.js 22, Express 5, Socket.IO, Mongoose (JavaScript, ESM) |
| Data | MongoDB Atlas (M0 in prod, `mongodb-atlas-local` in dev) with Atlas Vector Search |
| AI | Gemini (`gemini-3.5-flash-lite`, `gemini-embedding-2`, 768-dim) via an OpenAI-compatible provider layer |
| Files | Cloudinary; text extraction with `pdfjs-dist` (per page) and `mammoth` |
| Tests | `node:test`, supertest, mongodb-memory-server — 201 integration tests, fake LLM, no network |
| Deploy | Render (single Docker service serving API + built frontend), GitHub Actions CI |

## Evaluation

Both test sets are hand-written, small, and run against the real code path (not a reimplementation). Details and how to run them: [`eval/README.md`](eval/README.md).

### Retrieval (RAG)

47 Vietnamese questions over an office-themed dataset (6 users, 5 groups + 3 DMs, 84 messages, 3 shared documents): 41 must find the chunk containing an "evidence string"; 6 are **leak checks** where the asker has no access to the source.

| Configuration | recall@1 | recall@3 | recall@6 | MRR | Leaks |
| --- | --- | --- | --- | --- | --- |
| Query = current + previous question (first version, dropped) | 51% | 98% | 100% | 0.74 | 0/6 |
| **Current:** current question only, ≤10 messages/chunk | **88%** | 95% | 100% | **0.92** | 0/6 |
| ≤5 messages/chunk | 85% | 95% | 100% | 0.91 | 0/6 |

The eval changed a design decision: concatenating the previous question (meant to help follow-ups) mostly dragged in unrelated group chatter, so it was removed. Limitation: 33 chunks is an easy corpus — recall@6 saturates, so only recall@1/MRR separate configurations.

### Prompt injection

15 attacks hidden in **data** (another member's group message, a file in chat, a shared document reached via retrieval, a message from another group via retrieval, unread messages being summarized) + 2 control cases where the asker's own instruction must still be followed. Scored by regex on canary codes split across the injected instruction, so the code only appears if the model actually followed it. Each case run twice on `gemini-3.5-flash-lite`.

| Run | Successful attacks | Real question still answered | Controls passed |
| --- | --- | --- | --- |
| Before fixes | 4/30 | 29/30 | 4/4 |
| Fix 1: NFC normalization + "only the asker gives instructions" | 2/30 | 29/30 | 1/4 |
| **Fix 2 (current)** | **0/30** | **30/30** | **4/4** |

Holes found: a closing data tag written in decomposed Unicode (NFD) bypassed the tag filter; and when asked "what did Bình just say?", the bot reported the message correctly *and* obeyed the instruction inside it. Fix 1 closed both but broke the controls (the bot stopped honoring the asker's own language request), which Fix 2 resolved. 0/30 on 15 self-written attacks does not mean the bot can't be fooled.

## Key technical decisions

Full log with trade-offs: [`docs/DECISIONS.md`](docs/DECISIONS.md) (in Vietnamese).

- **AI lives in the Node backend, no Python service or queue.** Streaming reuses the existing Socket.IO rooms and the permission check stays in one place. Python is used only for offline eval metrics.
- **Permission filter inside the vector query**, not after it. Retrieval can never return a chunk the asker can't read, and the leak checks in the eval verify it.
- **Retrieval on every question, no tool calling or query rewriting.** With ~15 s per LLM call on the free model, a second call would double latency and quota use; one extra embedding (~1 s) is cheap.
- **Provider abstraction + free tier only.** Every call goes through an OpenAI-compatible `LLMProvider`; switching providers is an env change. Tests and CI use a fake provider, and no API key is linked to a card, so the worst case is a 429, never a bill.
- **The bot is a regular user** (`isBot: true`): its answers are normal messages, reusing unread counts, sockets and UI.
- **Atlas Local in dev, Atlas M0 in prod**: same `$vectorSearch` API, no code change between environments. Tests use an in-JS cosine search because mongodb-memory-server has no vector search.
- **One Render service serves both API and frontend**, so the refresh cookie is first-party (Safari would otherwise log users out on reload). Trade-off: the free instance sleeps and the first visit shows a blank page for about a minute.
- **No second "guard" LLM call for prompt injection.** Prompt changes reached 0/30 on the test set; a guard would double cost and latency. Revisit if a larger attack set shows the prompt isn't enough.

## Run locally

Requires Docker (or Node.js 22 + MongoDB Atlas Local for the manual route).

```bash
docker compose up --build
docker compose exec backend npm run seed   # demo data, password for all users: komi123
```

Open http://localhost:5173 and sign in as `an.nguyen`, `binh`, `chi`, `dung` or `hoa`.

Chat works without any keys. Optional features need a `.env` file in the repo root (next to `docker-compose.yml`, see [`backend/.env.example`](backend/.env.example)):

| Feature | Variables |
| --- | --- |
| Image/file upload | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Komi AI | `LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (e.g. a free Google AI Studio key, `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`) |
| Retrieval | `EMBEDDING_PROVIDER=openai-compatible`, `EMBEDDING_MODEL=gemini-embedding-2` (reuses the LLM key) |

Without Docker:

```bash
cd backend && cp .env.example .env && npm install && npm run dev
cd frontend && cp .env.example .env && npm install && npm run dev
```

Tests (downloads a MongoDB binary on first run, no network calls to AI providers):

```bash
cd backend && npm test
```

Deploying your own instance: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Known limitations

- **Free tier latency:** ~15–20 s per answer on `gemini-3.5-flash-lite`; the text arrives in one or two chunks rather than streaming smoothly.
- **Small evals:** both test sets are self-written and small; numbers compare configurations, they don't predict real-world quality.
- **Long answers may be cut off:** the provider doesn't read `finish_reason` yet, so a truncated answer isn't flagged.
- **Retrieval delay:** new messages become searchable across conversations after up to 10 minutes (chunk closes after 10 messages or 10 minutes of silence); the current conversation's last 20 messages are always in the prompt.
- **Document size:** shared documents are indexed up to the first 50,000 characters (~25 pages); scanned PDFs (no text layer) aren't supported.
- **Shared demo accounts** see each other's messages; anyone can read everything in the shared library.
- **Auth:** refresh tokens aren't rotated; changing the password ends other sessions but their access tokens remain valid until expiry (30 min).
- **Single instance:** the indexer has no lock, so running several backend instances would duplicate work.
- **Frontend:** bundle > 500 kB (no code splitting), lint not enforced in CI; `npm audit` reports unresolved dependency vulnerabilities.
