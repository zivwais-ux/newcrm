import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "חיבור השרת" };

const steps = [
  {
    title: "צור פרויקט ב־Supabase",
    body: "באתר supabase.com צור פרויקט חדש, ואז פתח Project Settings ← API.",
  },
  {
    title: "הקם את מבנה מסד הנתונים",
    body: "הרץ לפי הסדר את קובצי ה־SQL שבתיקייה supabase/migrations (בעורך ה־SQL, או עם supabase db push). הם יוצרים את כל הטבלאות, ההרשאות ופונקציות הניתוח.",
  },
  {
    title: "הוסף משתני סביבה",
    body: "העתק את .env.example ל־.env.local ומלא את NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ו־OPENAI_API_KEY. אחר כך הפעל מחדש את השרת.",
  },
];

export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/home");
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <Logo />
      <h1 className="mt-10 text-2xl font-bold tracking-tight">חיבור השרת</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        האפליקציה מוכנה. כדי לעבוד היא צריכה פרויקט Supabase (לכניסה ולשמירת הנתונים), ואם רוצים — גם מפתח OpenAI
        בשביל היועץ החכם.
      </p>
      <ol className="mt-10 space-y-8">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border text-xs font-medium tabular">{i + 1}</span>
            <div className="space-y-1">
              <p className="text-sm font-medium">{s.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <pre dir="ltr" className="mt-10 overflow-x-auto rounded-xl border bg-surface p-4 text-start shadow-xs font-mono text-xs leading-relaxed text-muted-foreground">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # only for npm run seed:demo
OPENAI_API_KEY=sk-...           # optional
OPENAI_MODEL=gpt-4.1-mini`}
      </pre>
    </div>
  );
}
