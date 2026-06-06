# 📖 Vocabulary Immersion Platform

Feed it English words you want to remember. Gemini keeps writing fresh, engaging reading
passages that weave those words in naturally — with the target words highlighted, a
glossary, and **spaced repetition** so the words you struggle with come back more often.

- **Multi-user** — sign up with an email + password; each account has its own private words,
  history, and progress.
- **Bring your own key** — each user enters their own free Gemini API key in **Settings**; it's
  stored only in their browser and used for their own requests (so everyone uses their own
  free quota, not the host's).
- **Backend** — Node + Express + Google's Gemini API (`gemini-2.5-flash-lite` by default;
  set `GEMINI_MODEL` to change it). Accounts + per-user data stored in a local **SQLite**
  database (via `@libsql/client` — prebuilt, no native compiler needed).
- **Frontend** — React + TypeScript + Vite.
- **Listen** — each passage has a 🔊 player (Listen / Pause / Stop, speed and voice controls).
  It uses the browser's built-in speech synthesis, so it's free and makes no API calls.
- **History** — every generated passage is saved; a History tab lets you re-open and re-read
  past passages (kept to the most recent 100).
- **Spaced repetition** — each word lives in a Leitner box (1–5). Low boxes and words you
  haven't seen in a while are weighted heavily when choosing what goes into the next
  passage. After reading you mark each word **Got it** (box up) or **Still learning**
  (back to box 1).
- **Pick your words** — check specific words in the list to force them into the next
  passage; with nothing checked it auto-selects by spaced repetition.
- **Choose the format** — sentences, paragraphs, a story, a conversation, or "Personalized"
  (a programming article, business story, science explanation, historical event, or anything
  you type).

## Project layout

```
.
├─ server/        Express API + spaced-repetition logic + Gemini generation
├─ client/        Vite + React + TypeScript app
├─ .env.example   Copy to .env and set JWT_SECRET
└─ data.db        SQLite database, created automatically (accounts + per-user data)
```

## Setup

1. **Configure the server.** Copy the example env file and set a `JWT_SECRET` (used to sign
   login sessions):

   ```bash
   cp .env.example .env
   # then edit .env and set JWT_SECRET to a long random string, e.g.:
   #   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   There's **no shared API key** — each user adds their own Gemini key in the app after signing
   in (get one free at <https://aistudio.google.com/apikey>).

2. **Install dependencies** (root tooling, server, and client):

   ```bash
   npm run install:all
   ```

## Run (development)

Start the API and the React dev server together:

```bash
npm run dev
```

- Web app: <http://localhost:5173>
- API: <http://localhost:3000> (the Vite dev server proxies `/api` to it)

Open the web app, **create an account**, then open **⚙ Settings** and paste your free Gemini
key. Add a few words, optionally check the ones you want to include, and hit **Generate
passage**. (With nothing checked, it auto-picks words for you by spaced repetition.)

## How it works

1. You sign in; your words and history are private to your account.
2. You add words; each starts in box 1 ("new").
3. On **Generate**, the server picks a weighted-random set of words (favoring low boxes and
   words not seen recently), asks Gemini (with your key) to write a passage using all of them,
   and records that those words were seen.
4. The passage renders with target words highlighted, plus a glossary.
5. You review each word — **Got it** promotes it up a box; **Still learning** resets it to
   box 1 so it resurfaces sooner.

Over time, words you know drift to higher boxes and appear less, while the tricky ones keep
coming back.

## Build for production (single service)

In production the **Express server also serves the built React app**, so everything runs as
one service on one port:

```bash
npm run build      # installs deps + builds the client into client/dist
npm start          # serves the API AND the built client on $PORT (default 3000)
```

Open `http://localhost:3000` — same app, one process.

## Deploy to Azure App Service

This repo is set up to deploy as a **single Linux App Service** (Node 20). The server serves
both the API and the React app, and stores data in a SQLite file on App Service's persistent
`/home` volume.

1. **Create the App Service** — Linux, runtime **Node 20 LTS**. The free **F1** tier works
   (it sleeps when idle); **B1** (~$13/mo) keeps it always-on.

2. **Configuration → Application settings** (environment variables):

   | Name | Value |
   |---|---|
   | `JWT_SECRET` | a long random string (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
   | `NODE_ENV` | `production` |
   | `VIP_DB_FILE` | `/home/data/data.db` (persists across restarts/deploys) |
   | `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` (so the build runs on deploy) |
   | `GEMINI_MODEL` | *(optional)* e.g. `gemini-2.5-flash-lite` |

3. **Configuration → General settings → Startup Command:** `npm start`

4. **Deploy** the repo with any of:
   - **VS Code** → Azure App Service extension → *Deploy to Web App*
   - **GitHub Actions** (the portal can scaffold a workflow), or
   - `az webapp up --runtime "NODE:20-lts"` from the repo root.

   On deploy, Azure runs `npm install` → `npm run build` (installs server + client and builds
   the client) → starts the server with `npm start`.

5. Browse the app's URL, **create an account**, open **⚙ Settings**, and paste your Gemini key.

**Notes:**
- Keep it to a **single instance** (don't scale out) — the SQLite file is local to one host.
- Cookies are marked `secure` when `NODE_ENV=production`, so the app must be served over
  **HTTPS** (App Service URLs already are).
- Back up `/home/data/data.db` periodically if the accounts matter. For bigger scale or
  multi-instance, switch to a managed database (Postgres/MySQL/Cosmos).

## Notes

- Generation uses Gemini with a JSON response schema, so the passage + glossary come back as
  structured JSON. The model defaults to `gemini-2.5-flash-lite` and is set via the
  `GEMINI_MODEL` env var; adjust the length or prompt in
  [`server/src/gemini.ts`](server/src/gemini.ts).
- The free Gemini tier has a limited number of requests per day (varies by model). If you hit
  it, the app shows a friendly message — wait for the daily reset, switch `GEMINI_MODEL` to a
  model with more free headroom, or enable billing for higher limits.
- All state (accounts + per-user words/history) lives in a single **SQLite** database
  (`data.db` locally; `VIP_DB_FILE` elsewhere) — delete the file to start fresh. Passwords are
  stored hashed (bcrypt); users' Gemini keys are **not** stored on the server (they live in
  each user's browser).
- **Sharing it with others:** see *Deploy to Azure App Service* above (or any Node host with a
  persistent disk for the SQLite file).
