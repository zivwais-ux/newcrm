"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function authMessage(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "That email and password don't match. Please try again.";
  if (m.includes("already registered") || m.includes("already been registered")) return "An account with this email already exists. Try signing in.";
  if (m.includes("password")) return "Your password needs at least 8 characters.";
  if (m.includes("email not confirmed")) return "Please confirm your email first — check your inbox.";
  if (m.includes("rate limit")) return "Too many attempts. Please wait a minute and try again.";
  return "We couldn't complete that. Please try again.";
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
      setError("Your password needs at least 8 characters.");
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
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-muted-foreground">We sent you a confirmation link. Open it to finish creating your workspace.</p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">{mode === "signup" ? "Create your Business OS" : "Welcome back"}</h1>
        <p className="text-sm text-muted-foreground">
          {mode === "signup" ? "Start with an empty workspace built around your business." : "Sign in to your workspace."}
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        {mode === "signup" && (
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Your name</Label>
            <Input id="fullName" name="fullName" autoComplete="name" required placeholder="Ziv Cohen" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@business.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            placeholder={mode === "signup" ? "At least 8 characters" : undefined}
          />
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-negative-soft px-3 py-2 text-sm text-negative">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          {mode === "signup" ? "Create account" : "Sign in"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-foreground hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="font-medium text-foreground hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
