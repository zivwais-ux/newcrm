"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Blocks, CheckSquare, Handshake, Receipt, Search, Sparkles, Upload, UserPlus, Users } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { globalSearch, type SearchResult } from "@/lib/actions/search";

const ICONS = { customer: Users, lead: UserPlus, deal: Handshake, transaction: Receipt, component: Blocks } as const;
const GROUPS: { type: SearchResult["type"]; label: string }[] = [
  { type: "customer", label: "לקוחות" },
  { type: "lead", label: "פניות" },
  { type: "deal", label: "עסקאות" },
  { type: "transaction", label: "מכירות" },
  { type: "component", label: "כלים" },
];

const QUICK = [
  { href: "/customers", label: "מעבר ללקוחות", icon: Users },
  { href: "/tasks", label: "מעבר למשימות", icon: CheckSquare },
  { href: "/ai", label: "שאל את היועץ", icon: Sparkles },
  { href: "/data/import", label: "העלאת נתונים", icon: Upload },
];

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => startTransition(async () => setResults(await globalSearch(query))), 200);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        type="button"
        aria-label="חיפוש או פעולה"
        className="group flex h-10 w-full max-w-md items-center gap-2.5 rounded-xl border bg-surface px-3 text-[14px] text-muted-foreground shadow-xs transition-all hover:border-zinc-300 hover:shadow-sm cursor-pointer"
      >
        <Search className="size-4 text-zinc-400 transition-colors group-hover:text-brand" />
        <span className="flex-1 truncate text-start">חיפוש או פעולה…</span>
        <kbd dir="ltr" className="hidden rounded-md border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[16%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl [&>button]:hidden">
          <DialogTitle className="sr-only">חיפוש</DialogTitle>
          <Command shouldFilter={false}>
            <CommandInput placeholder="חפש לקוח, עסקה, מכירה או כלי…"
              dir="auto" value={query} onValueChange={setQuery} autoFocus />
            <CommandList>
              {query.trim().length >= 2 && (
                <CommandEmpty>{pending ? "מחפש…" : "לא נמצאו תוצאות."}</CommandEmpty>
              )}
              {query.trim().length < 2 && (
                <div className="p-1">
                  <p className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">פעולות מהירות</p>
                  {QUICK.map((a) => (
                    <CommandItem
                      key={a.href}
                      value={a.href}
                      onSelect={() => {
                        setOpen(false);
                        router.push(a.href);
                      }}
                    >
                      <a.icon />
                      {a.label}
                    </CommandItem>
                  ))}
                  <p className="px-2 pt-3 pb-1 text-xs text-muted-foreground">הקלד לפחות שתי אותיות כדי לחפש.</p>
                </div>
              )}
              {GROUPS.map((g) => {
                const items = results.filter((r) => r.type === g.type);
                if (!items.length) return null;
                const Icon = ICONS[g.type];
                return (
                  <CommandGroup key={g.type} heading={g.label}>
                    {items.map((r) => (
                      <CommandItem
                        key={`${r.type}-${r.id}`}
                        value={`${r.type}-${r.id}`}
                        onSelect={() => {
                          setOpen(false);
                          setQuery("");
                          router.push(r.href);
                        }}
                      >
                        <Icon />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{r.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{r.subtitle}</span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
