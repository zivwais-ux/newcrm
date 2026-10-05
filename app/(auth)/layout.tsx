import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/layout/logo";

const POINTS = [
  "לקוחות, מכירות ומשימות — במקום אחד",
  "מעלים קובץ אקסל ומתחילים לעבוד תוך דקות",
  "יועץ חכם שאומר לך למי לחזור היום",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex min-h-screen flex-col">
        <header className="px-6 py-5 sm:px-10">
          <Link href="/" aria-label="Business OS">
            <Logo />
          </Link>
        </header>
        <main className="flex flex-1 items-start justify-center px-4 pt-[8vh] pb-16 sm:items-center sm:pt-0">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
      <aside className="relative hidden overflow-hidden border-s bg-gradient-to-br from-brand-soft via-background to-surface lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div aria-hidden className="pointer-events-none absolute -top-24 -end-24 size-96 rounded-full bg-brand/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -start-16 size-80 rounded-full bg-brand/5 blur-3xl" />
        <div className="relative max-w-md space-y-8">
          <div className="space-y-3">
            <p className="text-sm font-medium text-brand">Business OS</p>
            <h2 className="text-4xl leading-tight font-bold tracking-tight text-balance">כל העסק שלך במסך אחד</h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              בלי טבלאות מסובכות ובלי הדרכות. בוחרים את הכלים שמתאימים לעסק, והמסך מסתדר לבד.
            </p>
          </div>
          <ul className="space-y-4">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-[15px]">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-brand shadow-xs ring-1 ring-brand/10">
                  <CheckCircle2 className="size-4" />
                </span>
                <span className="pt-0.5">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
