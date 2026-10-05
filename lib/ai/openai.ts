import "server-only";
import OpenAI from "openai";

// OpenAI is only ever called from the server. The key never reaches the browser.

let client: OpenAI | null = null;

export function isAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 1 });
  return client;
}

export function aiModel() {
  return process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

export const AI_UNAVAILABLE_NOTICE =
  "היועץ החכם לא מחובר כרגע, ולכן התשובה הופקה על ידי מנוע הניתוח המובנה מתוך הנתונים שלך.";
export const AI_FAILED_NOTICE =
  "שירות ה-AI לא הגיב, ולכן התשובה הופקה על ידי מנוע הניתוח המובנה מתוך הנתונים שלך.";
