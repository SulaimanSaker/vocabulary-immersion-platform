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
  set `GEMINI_MODEL` to change it). Accounts + per-user data stored in a local `data.json`
  (no database to set up).
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
└─ data.json      Created automatically (accounts + each user's words/progress)
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

## Build for production

```bash
npm run build      # builds the client into client/dist
npm start          # runs the API (serve client/dist with any static host)
```

## Notes

- Generation uses Gemini with a JSON response schema, so the passage + glossary come back as
  structured JSON. The model defaults to `gemini-2.5-flash-lite` and is set via the
  `GEMINI_MODEL` env var; adjust the length or prompt in
  [`server/src/gemini.ts`](server/src/gemini.ts).
- The free Gemini tier has a limited number of requests per day (varies by model). If you hit
  it, the app shows a friendly message — wait for the daily reset, switch `GEMINI_MODEL` to a
  model with more free headroom, or enable billing for higher limits.
- All state (accounts + per-user words/history) is a single `data.json` at the repo root —
  delete it to start fresh. Passwords are stored hashed (bcrypt); users' Gemini keys are
  **not** stored on the server (they live in each user's browser).
- **Sharing it with others:** to let other people sign up, deploy it to a host that runs Node,
  serves the built client, and keeps `data.json` on persistent storage. Set a stable
  `JWT_SECRET` there, and serve over HTTPS (then enable the `secure` cookie flag in
  [`server/src/auth.ts`](server/src/auth.ts)). This repo is set up for local/single-host use.
```
