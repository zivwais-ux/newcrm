import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Connect your backend" };

const steps = [
  {
    title: "Create a Supabase project",
    body: "In supabase.com create a project, then open Project Settings → API.",
  },
  {
    title: "Apply the database schema",
    body: "Run the SQL files in supabase/migrations in order (SQL editor, or `supabase db push`). They create every table, row level security policy and analytics function.",
  },
  {
    title: "Add your environment variables",
    body: "Copy .env.example to .env.local and fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and OPENAI_API_KEY. Restart the dev server.",
  },
];

export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/home");
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <Logo />
      <h1 className="mt-10 text-2xl font-semibold tracking-tight">Connect your backend</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The app is ready. It needs a Supabase project for authentication and data, and optionally an OpenAI key for the AI
        features.
      </p>
      <ol className="mt-10 space-y-8">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border text-xs font-medium tabular">{i + 1}</span>
            <div className="space-y-1">
              <p className="text-sm font-medium">{s.title}</p>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <pre className="mt-10 overflow-x-auto rounded-md border bg-surface p-4 font-mono text-xs leading-relaxed text-muted-foreground">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # only for npm run seed:demo
OPENAI_API_KEY=sk-...           # optional
OPENAI_MODEL=gpt-4.1-mini`}
      </pre>
    </div>
  );
}
