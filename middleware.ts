import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // api/agents is the Python agent function: it checks the caller's token itself and must not be redirected to login.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/agents|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
