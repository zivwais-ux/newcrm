// Limits shared by the AI analyst chat (client) and its API route (server).
// The client trims what it sends to these limits so a long conversation never
// fails validation; the server still enforces them.

/** Most recent messages sent to /api/ai/analyst per question. */
export const ANALYST_MAX_MESSAGES = 12;
/** Max characters per message (longer assistant answers are truncated before sending). */
export const ANALYST_MAX_MESSAGE_CHARS = 4000;
/** Max characters for a question typed by the user. */
export const ANALYST_MAX_QUESTION_CHARS = 1000;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Keeps the last ANALYST_MAX_MESSAGES non-empty turns, each cut to ANALYST_MAX_MESSAGE_CHARS. */
export function trimHistory(turns: ChatTurn[]): ChatTurn[] {
  return turns
    .map((t) => ({ role: t.role, content: t.content.trim().slice(0, ANALYST_MAX_MESSAGE_CHARS) }))
    .filter((t) => t.content.length > 0)
    .slice(-ANALYST_MAX_MESSAGES);
}
