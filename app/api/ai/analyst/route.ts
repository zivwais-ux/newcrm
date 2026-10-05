import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/supabase/server";
import { runAnalyst } from "@/lib/ai/analyst";

export const maxDuration = 60;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(20),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.user || !session.org) {
    return NextResponse.json({ error: "יש להתחבר כדי לשאול את היועץ." }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "כתוב שאלה." }, { status: 400 });

  try {
    const result = await runAnalyst(session.supabase, session.org, parsed.data.messages);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api] analyst", (error as Error).message);
    return NextResponse.json({ error: "היועץ לא הצליח לענות כרגע. נסה שוב." }, { status: 500 });
  }
}
