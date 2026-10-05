import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/server";
import { getBrief } from "@/lib/analytics/brief";

export const maxDuration = 60;

export async function POST() {
  const session = await getSession();
  if (!session.user || !session.org) return NextResponse.json({ error: "יש להתחבר כדי להמשיך." }, { status: 401 });
  try {
    const brief = await getBrief(session.supabase, session.org, { refresh: true });
    return NextResponse.json(brief);
  } catch (error) {
    console.error("[api] brief", (error as Error).message);
    return NextResponse.json({ error: "לא הצלחנו לרענן את הסיכום כרגע. נסה שוב." }, { status: 500 });
  }
}
