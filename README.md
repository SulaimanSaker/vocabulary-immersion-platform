# 📖 Vocabulary Immersion Platform

Feed it English words you want to remember. Gemini keeps writing fresh, engaging reading
passages that weave those words in naturally — with the target words highlighted, a
glossary, and **spaced repetition** so the words you struggle with come back more often.

- **Backend** — Node + Express + Google's Gemini API (`gemini-2.5-flash`, free tier), words
  and review state stored in a local `data.json` (no database to set up).
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
├─ .env.example   Copy to .env and add your GEMINI_API_KEY
└─ data.json      Created automatically (your words + progress)
```

## Setup

1. **Add your API key.** Copy the example env file and paste in a **free** key from
   <https://aistudio.google.com/apikey>:

   ```bash
   cp .env.example .env
   # then edit .env and set GEMINI_API_KEY=...
   ```

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

Open the web app, add a few words, optionally check the ones you want to include, and hit
**Generate passage**. (With nothing checked, it auto-picks words for you by spaced repetition.)

## How it works

1. You add words; each starts in box 1 ("new").
2. On **Generate**, the server picks a weighted-random set of words (favoring low boxes and
   words not seen recently), asks Gemini to write a passage using all of them, and records
   that those words were seen.
3. The passage renders with target words highlighted, plus a glossary.
4. You review each word — **Got it** promotes it up a box; **Still learning** resets it to
   box 1 so it resurfaces sooner.

Over time, words you know drift to higher boxes and appear less, while the tricky ones keep
coming back.

## Build for production

```bash
npm run build      # builds the client into client/dist
npm start          # runs the API (serve client/dist with any static host)
```

## Notes

- Generation uses `gemini-2.5-flash` with a JSON response schema, so the passage + glossary
  come back as structured JSON. Adjust the model, length, or prompt in
  [`server/src/gemini.ts`](server/src/gemini.ts).
- The free Gemini tier has generous per-minute/per-day limits that are plenty for personal
  study. If you hit a limit, you'll see an error — just wait a bit and try again.
- All state is a single `data.json` at the repo root — delete it to start fresh.
```
