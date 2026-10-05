import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/supabase/server";
import { suggestColumnMappings } from "@/lib/ai/map-columns";

export const maxDuration = 60;

const bodySchema = z.object({
  headers: z.array(z.string().max(200)).min(1).max(200),
  sample: z.array(z.record(z.string(), z.unknown())).max(25),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.user || !session.org) return NextResponse.json({ error: "יש להתחבר כדי להמשיך." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "לא הצלחנו לקרוא את העמודות בקובץ הזה." }, { status: 400 });
  const result = await suggestColumnMappings(parsed.data.headers, parsed.data.sample);
  return NextResponse.json(result);
}
