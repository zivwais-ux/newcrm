import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/supabase/server";
import { runAnalyst } from "@/lib/ai/analyst";
import { ANALYST_MAX_MESSAGE_CHARS, ANALYST_MAX_MESSAGES } from "@/lib/ai/limits";
import { parseFilters } from "@/lib/components/filters";

export const maxDuration = 60;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(ANALYST_MAX_MESSAGE_CHARS) }))
    .min(1)
    .max(ANALYST_MAX_MESSAGES),
  /** Active workspace filters (same keys as the URL: range, service, stage). Validated by parseFilters. */
  filters: z
    .object({ range: z.string().nullish(), service: z.string().nullish(), stage: z.string().nullish() })
    .nullish(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.user || !session.org) {
    return NextResponse.json({ error: "יש להתחבר כדי לשאול את היועץ." }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "השאלה ארוכה מדי או ריקה. נסח אותה בקצרה ונסה שוב." }, { status: 400 });
  if (parsed.data.messages.at(-1)?.role !== "user") return NextResponse.json({ error: "כתוב שאלה." }, { status: 400 });

  const f = parsed.data.filters;
  const filters = parseFilters({ range: f?.range ?? undefined, service: f?.service ?? undefined, stage: f?.stage ?? undefined });

  try {
    const result = await runAnalyst(session.supabase, session.org, parsed.data.messages, filters);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api] analyst", (error as Error).message);
    return NextResponse.json({ error: "היועץ לא הצליח לענות כרגע. נסה שוב." }, { status: 500 });
  }
}
