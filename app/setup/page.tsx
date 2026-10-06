import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { Module, ModuleBody, ModuleRail } from "@/components/ui/module";
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
    <div className="dot-grid grain min-h-screen bg-table">
      <div className="mx-auto max-w-2xl px-4 pt-6 pb-20 sm:px-8">
        <Logo />
        <h1 className="mt-10 text-2xl font-bold tracking-tight sm:text-3xl">חיבור השרת</h1>
        <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
          האפליקציה מוכנה. כדי לעבוד היא צריכה פרויקט Supabase (לכניסה ולשמירת הנתונים), ואם רוצים — גם מפתח OpenAI
          בשביל היועץ החכם.
        </p>
        <Module className="mt-8">
          <ModuleRail title="שלושה צעדים" meta={<span className="num">{steps.length}</span>} />
          <ol className="divide-y divide-border">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4 px-4 py-4 sm:px-5">
                <span className="num grid size-6 shrink-0 place-items-center rounded-sm border border-border bg-rail text-[11px] font-medium text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Module>
        <Module className="mt-6">
          <ModuleRail title=".env.local" />
          <ModuleBody className="p-0 sm:p-0">
            <pre dir="ltr" className="overflow-x-auto p-4 text-start font-mono text-xs leading-relaxed text-muted-foreground">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # only for npm run seed:demo
OPENAI_API_KEY=sk-...           # optional
OPENAI_MODEL=gpt-4.1-mini`}
            </pre>
          </ModuleBody>
        </Module>
      </div>
    </div>
  );
}
