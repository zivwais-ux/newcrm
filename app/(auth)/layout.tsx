import Link from "next/link";
import { ChartLineUp, Repeat, Sun } from "@phosphor-icons/react/dist/ssr";
import { Logo } from "@/components/layout/logo";
import { Module, ModuleBody, ModuleRail } from "@/components/ui/module";
import { Skeleton } from "@/components/ui/skeleton";

/** Empty tools sitting on the table, wired together. Shapes only, no data. */
function WorkspaceSketch() {
  return (
    <div dir="ltr" aria-hidden className="relative h-[420px] w-[520px] select-none">
      <svg viewBox="0 0 520 420" className="absolute inset-0 size-full overflow-visible" fill="none">
        <path d="M250 150 V172 H115 V200" stroke="var(--line)" strokeWidth="1.25" />
        <path d="M420 150 V258" stroke="var(--brand)" strokeWidth="1.5" className="flow-dash" />
        <path d="M232 318 H252 V330 H272" stroke="var(--line)" strokeWidth="1.25" />
        {[
          [250, 150],
          [115, 200],
          [420, 150],
          [420, 258],
          [232, 318],
          [272, 330],
        ].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x - 3} y={y - 3} width="6" height="6" fill="var(--module)" stroke="var(--line)" />
        ))}
      </svg>

      <Module dir="rtl" className="absolute top-0 left-[190px] w-[310px]">
        <ModuleRail index={1} icon={<ChartLineUp />} title="הכנסות" />
        <ModuleBody className="space-y-3 p-4 sm:p-4">
          <Skeleton className="h-7 w-28 animate-none" />
          <div className="flex h-14 items-end gap-1.5">
            {[40, 62, 48, 75, 58, 88, 70, 95].map((h, i) => (
              <Skeleton key={i} className="flex-1 animate-none" style={{ height: `${h}%` }} />
            ))}
          </div>
        </ModuleBody>
      </Module>

      <Module dir="rtl" className="absolute top-[200px] left-0 w-[232px]">
        <ModuleRail index={2} icon={<Sun />} title="היום" />
        <ModuleBody className="space-y-2.5 p-4 sm:p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="size-3.5 shrink-0 rounded-sm border border-border-strong" />
              <Skeleton className="h-2.5 flex-1 animate-none" style={{ maxWidth: `${80 - i * 18}%` }} />
            </div>
          ))}
        </ModuleBody>
      </Module>

      <Module dir="rtl" className="absolute top-[258px] left-[272px] w-[248px]">
        <ModuleRail index={3} icon={<Repeat />} title="לקוחות חוזרים" />
        <ModuleBody className="space-y-2.5 p-4 sm:p-4">
          <Skeleton className="h-2 w-full animate-none" />
          <Skeleton className="h-2.5 w-3/5 animate-none" />
          <Skeleton className="h-2.5 w-2/5 animate-none" />
        </ModuleBody>
      </Module>
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-module lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
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
      <aside className="dot-grid grain relative hidden overflow-hidden border-s border-border bg-table lg:flex lg:flex-col lg:items-center lg:justify-center lg:gap-12 lg:px-12 lg:py-16">
        <div className="max-w-md space-y-2 text-center">
          <h2 className="text-3xl leading-tight font-bold tracking-tight text-balance">מסך העבודה שלך, בנוי מהכלים שבחרת</h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            בוחרים כלים — הכנסות, משימות, לקוחות — ומסדרים אותם על המסך כמו שנוח לעסק שלך.
          </p>
        </div>
        <div className="origin-top scale-[0.85] xl:scale-100">
          <WorkspaceSketch />
        </div>
      </aside>
    </div>
  );
}
