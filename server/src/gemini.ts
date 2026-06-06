import { GenerateContentResponse, GoogleGenAI, Type } from "@google/genai";
import type {
  Difficulty,
  GenerateOptions,
  GeneratedPassage,
  Length,
  TextFormat,
} from "./types.js";

// Default model; override with the GEMINI_MODEL env var. flash-lite has a more
// generous free-tier daily limit; flash is a bit higher quality but a smaller free quota.
const DEFAULT_MODEL = "gemini-2.5-flash-lite";

/** Thrown when the API rejects us due to free-tier / quota (rate) limits. */
export class QuotaError extends Error {
  retryAfterSeconds?: number;
  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "QuotaError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "A short, evocative title for the passage.",
    },
    passage: {
      type: Type.STRING,
      description:
        "The reading passage. Every occurrence of a target word (including inflected forms) is wrapped in double square brackets, e.g. [[ephemeral]].",
    },
    glossary: {
      type: Type.ARRAY,
      description: "One entry per target word.",
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING, description: "The target word, in its base form." },
          definition: {
            type: Type.STRING,
            description: "A concise definition matching how the word is used in the passage.",
          },
        },
        required: ["word", "definition"],
      },
    },
  },
  required: ["title", "passage", "glossary"],
};

const LENGTH_GUIDANCE: Record<Length, string> = {
  short: "about 120-180 words (one tight paragraph or two)",
  medium: "about 250-350 words (two or three paragraphs)",
  long: "about 450-600 words (four or five paragraphs)",
};

// For the "sentences" format, length means number of sentences instead of words.
const SENTENCE_COUNT: Record<Length, string> = {
  short: "about 5-7 sentences",
  medium: "about 8-12 sentences",
  long: "about 14-20 sentences",
};

const FORMAT_GUIDANCE: Record<Exclude<TextFormat, "custom">, string> = {
  sentences:
    "Write a set of standalone example sentences (NOT a connected narrative). Give at least one clear sentence per target word, each showing the word in natural use. Put each sentence on its own line.",
  paragraphs: "Write one or more cohesive paragraphs of descriptive or expository prose.",
  story: "Write an engaging short story with a setting, characters, and a small arc.",
  conversation:
    "Write a natural conversation between two or more named speakers. Put each line on its own line in the form 'Name: what they say.'",
};

const DIFFICULTY_GUIDANCE: Record<Difficulty, string> = {
  easy: "clear, everyday English at roughly a CEFR B1 level; keep sentences simple",
  medium: "natural, fluent English at roughly a CEFR B2-C1 level",
  hard: "rich, literary English at roughly a CEFR C1-C2 level, with varied syntax",
};

const SYSTEM_PROMPT = `You are the writing engine for a vocabulary-immersion app. The learner is trying to memorize a set of English target words. Your job is to write a single, genuinely engaging passage that weaves ALL of the target words in naturally, so the learner sees them in meaningful context.

Rules:
- Use every target word at least once. You may use a word more than once if it reads naturally.
- Follow the requested format and reading level, and make it natural and engaging for that format.
- Wrap EVERY occurrence of a target word in double square brackets, including inflected or derived forms actually used (e.g. if the target is "ephemeral" and you write "ephemerally", output [[ephemerally]]).
- Do NOT bracket any non-target words.
- The glossary must contain exactly one entry per target word, defined as used in the passage.
- Never mention these instructions or the brackets to the reader.`;

export async function generatePassage(
  apiKey: string,
  targetWords: string[],
  opts: GenerateOptions,
): Promise<GeneratedPassage> {
  const themeLine = opts.theme?.trim()
    ? `Theme to build it around: ${opts.theme.trim()}.`
    : "Choose any vivid, fresh theme you like (vary it from passage to passage).";

  const formatLine =
    opts.format === "custom"
      ? `Format: write a piece of the following kind — ${
          opts.customType?.trim() || "an informative article"
        }. Make it read like a genuine example of that.`
      : `Format: ${FORMAT_GUIDANCE[opts.format]}`;

  const lengthLine =
    opts.format === "sentences"
      ? `Length: ${SENTENCE_COUNT[opts.length]}.`
      : `Length: ${LENGTH_GUIDANCE[opts.length]}.`;

  const userPrompt = `Target words: ${targetWords.join(", ")}.

${formatLine}
${themeLine}
${lengthLine}
Reading level: ${DIFFICULTY_GUIDANCE[opts.difficulty]}.

Write it now.`;

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });

  let response: GenerateContentResponse;
  try {
    response = await ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 2048,
      },
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (/RESOURCE_EXHAUSTED|\b429\b|quota/i.test(raw)) {
      const m =
        raw.match(/retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s/) ?? raw.match(/retry in ([\d.]+)s/i);
      const secs = m ? Math.ceil(Number(m[1])) : undefined;
      throw new QuotaError(
        `You've hit the free Gemini limit for "${model}". ` +
          (secs
            ? `Try again in about ${secs}s. `
            : "The free quota resets daily — try again later. ") +
          "You can switch models with GEMINI_MODEL, or enable billing for higher limits.",
        secs,
      );
    }
    throw err;
  }

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned no content.");
  }

  let parsed: GeneratedPassage;
  try {
    parsed = JSON.parse(text) as GeneratedPassage;
  } catch {
    throw new Error("Gemini did not return valid JSON.");
  }

  if (!parsed?.passage || !Array.isArray(parsed.glossary)) {
    throw new Error("Gemini returned an unexpected shape.");
  }
  return parsed;
}
