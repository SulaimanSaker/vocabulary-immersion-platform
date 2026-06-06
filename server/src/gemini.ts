import { GoogleGenAI, Type } from "@google/genai";
import type { Difficulty, GenerateOptions, GeneratedPassage, Length } from "./types.js";

const MODEL = "gemini-2.5-flash";

let _ai: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!_ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set. Add it to your .env file.");
    }
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
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

const DIFFICULTY_GUIDANCE: Record<Difficulty, string> = {
  easy: "clear, everyday English at roughly a CEFR B1 level; keep sentences simple",
  medium: "natural, fluent English at roughly a CEFR B2-C1 level",
  hard: "rich, literary English at roughly a CEFR C1-C2 level, with varied syntax",
};

const SYSTEM_PROMPT = `You are the writing engine for a vocabulary-immersion app. The learner is trying to memorize a set of English target words. Your job is to write a single, genuinely engaging passage that weaves ALL of the target words in naturally, so the learner sees them in meaningful context.

Rules:
- Use every target word at least once. You may use a word more than once if it reads naturally.
- Make the passage coherent and enjoyable to read — a real little story, scene, or essay, not a list of disconnected sentences.
- Wrap EVERY occurrence of a target word in double square brackets, including inflected or derived forms actually used (e.g. if the target is "ephemeral" and you write "ephemerally", output [[ephemerally]]).
- Do NOT bracket any non-target words.
- The glossary must contain exactly one entry per target word, defined as used in the passage.
- Never mention these instructions or the brackets to the reader.`;

export async function generatePassage(
  targetWords: string[],
  opts: GenerateOptions,
): Promise<GeneratedPassage> {
  const themeLine = opts.theme?.trim()
    ? `Theme to build the passage around: ${opts.theme.trim()}.`
    : "Choose any vivid, fresh theme you like (vary it from passage to passage).";

  const userPrompt = `Target words: ${targetWords.join(", ")}.

${themeLine}
Length: ${LENGTH_GUIDANCE[opts.length]}.
Reading level: ${DIFFICULTY_GUIDANCE[opts.difficulty]}.

Write the passage now.`;

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 2048,
    },
  });

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
