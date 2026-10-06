"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleNotch, EnvelopeSimpleOpen } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function authMessage(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "האימייל או הסיסמה לא נכונים. נסה שוב.";
  if (m.includes("already registered") || m.includes("already been registered")) return "כבר יש חשבון עם האימייל הזה. נסה להיכנס.";
  if (m.includes("password")) return "הסיסמה צריכה להכיל לפחות 8 תווים.";
  if (m.includes("email not confirmed")) return "צריך לאשר קודם את האימייל — בדוק את תיבת הדואר.";
  if (m.includes("rate limit")) return "יותר מדי ניסיונות. חכה דקה ונסה שוב.";
  return "משהו השתבש. נסה שוב.";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("fullName") ?? "").trim();
    if (mode === "signup" && password.length < 8) {
      setError("הסיסמה צריכה להכיל לפחות 8 תווים.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
        });
        if (error) throw error;
        if (!data.session) {
          setCheckEmail(true);
          return;
        }
        router.replace("/onboarding");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const next = params.get("next");
        router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/home");
      }
      router.refresh();
    } catch (err) {
      setError(authMessage((err as Error).message ?? ""));
    } finally {
      setLoading(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="space-y-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
          <EnvelopeSimpleOpen className="size-5" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">בדוק את האימייל שלך</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">שלחנו לך קישור לאישור. לחץ עליו כדי לסיים לפתוח את החשבון.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{mode === "signup" ? "פתיחת חשבון חדש" : "שמחים לראות אותך שוב"}</h1>
        <p className="text-[15px] text-muted-foreground">
          {mode === "signup" ? "מתחילים ממסך נקי, שנבנה סביב העסק שלך. בלי כרטיס אשראי." : "היכנס כדי להמשיך מאיפה שעצרת."}
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        {mode === "signup" && (
          <div className="space-y-1.5">
            <Label htmlFor="fullName">השם שלך</Label>
            <Input id="fullName" name="fullName" autoComplete="name" required dir="auto" placeholder="ישראל ישראלי" className="h-10" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">אימייל</Label>
          <Input id="email" name="email" type="email" dir="ltr" autoComplete="email" required placeholder="you@business.com" className="h-10 text-end" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">סיסמה</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            dir="ltr"
            className="h-10 text-end"
            placeholder={mode === "signup" ? "לפחות 8 תווים" : undefined}
          />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2.5 text-sm text-negative">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <CircleNotch className="animate-spin" />}
          {mode === "signup" ? "פתח חשבון" : "כניסה"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {mode === "signup" ? (
          <>
            כבר יש לך חשבון?{" "}
            <Link href="/login" className="font-medium text-brand hover:underline">
              כניסה
            </Link>
          </>
        ) : (
          <>
            עדיין אין לך חשבון?{" "}
            <Link href="/signup" className="font-medium text-brand hover:underline">
              הרשמה
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
