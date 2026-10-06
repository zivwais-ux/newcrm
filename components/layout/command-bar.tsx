"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowElbowDownLeft,
  CalendarPlus,
  CheckSquare,
  Cube,
  Handshake,
  MagnifyingGlass,
  Receipt,
  SignIn,
  Sparkle,
  SquaresFour,
  UserPlus,
  Users,
} from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { globalSearch, searchCustomers, type SearchResult } from "@/lib/actions/search";
import { addComponent } from "@/lib/actions/components";
import { parseCommand, type Command as ParsedCommand } from "@/lib/command/parse";
import { COMPONENT_REGISTRY } from "@/lib/components/registry";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useCreate } from "./create-provider";
import { useMoney } from "./workspace-provider";

const MODULES = COMPONENT_REGISTRY.map((d) => ({ id: d.id, name: d.name }));

const RESULT_ICONS = { customer: Users, lead: UserPlus, deal: Handshake, transaction: Receipt, component: Cube } as const;
const GROUPS: { type: SearchResult["type"]; label: string }[] = [
  { type: "customer", label: "לקוחות" },
  { type: "lead", label: "פניות" },
  { type: "deal", label: "עסקאות" },
  { type: "transaction", label: "מכירות" },
  { type: "component", label: "מודולים" },
];

const EXAMPLES = [
  "מכירה 250 לדנה על תספורת",
  "תור ליוסי מחר ב-10",
  "לקוח חדש רונית 0501234567",
  "משימה להתקשר לספק ביום חמישי",
  "הוסף מודול לקוחות חוזרים",
  "כמה הכנסתי החודש?",
];

const OPEN_EVENT = "bos:command";
/** Open the command bar from anywhere (dock, empty states), optionally with text. */
export function openCommandBar(text = "") {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: text }));
}

/** One sentence per intent, shown before the user presses Enter. */
function Describe({ cmd }: { cmd: ParsedCommand }) {
  const currency = useMoney();
  const part = (v: string | null | undefined, empty: string) =>
    v ? <span className="font-semibold text-foreground">{v}</span> : <span className="text-muted-foreground">{empty}</span>;
  switch (cmd.kind) {
    case "sale":
      return (
        <>
          מכירה מהירה · {part(cmd.amount ? formatCurrency(cmd.amount, currency) : null, "סכום")} · {part(cmd.name, "לקוח")}
          {cmd.service && <> · {part(cmd.service, "")}</>}
        </>
      );
    case "appointment":
      return (
        <>
          תור חדש · {part(cmd.name, "לקוח")} · {part(cmd.date ? formatDate(cmd.date) : null, "היום")} · {part(cmd.time, "שעה")}
        </>
      );
    case "customer":
      return (
        <>
          לקוח חדש · {part(cmd.name, "שם")}
          {cmd.phone && <> · <span className="num font-semibold text-foreground" dir="ltr">{cmd.phone}</span></>}
        </>
      );
    case "task":
      return (
        <>
          משימה · {part(cmd.title, "")}
          {cmd.date && <> · {part(formatDate(cmd.date), "")}</>}
        </>
      );
    case "open":
      return <>מעבר ל{part(cmd.label, "")}</>;
    case "add-module":
      return <>הוספת המודול {part(cmd.name, "")} למסך העבודה</>;
    case "ask":
      return <>שאל את היועץ החכם</>;
    default:
      return null;
  }
}

const INTENT_ICONS: Record<ParsedCommand["kind"], React.ElementType> = {
  sale: Receipt,
  appointment: CalendarPlus,
  customer: UserPlus,
  task: CheckSquare,
  open: SignIn,
  "add-module": SquaresFour,
  ask: Sparkle,
  search: MagnifyingGlass,
};

export function CommandBar() {
  const router = useRouter();
  const create = useCreate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pending, startTransition] = useTransition();
  const [running, startRun] = useTransition();
  const [hint, setHint] = useState(0);

  const cmd = useMemo(() => parseCommand(query, MODULES), [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = (e: Event) => {
      setQuery((e as CustomEvent<string>).detail ?? "");
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // Rotate the example in the closed bar so people discover what it can do.
  useEffect(() => {
    const t = setInterval(() => setHint((h) => (h + 1) % EXAMPLES.length), 4000);
    return () => clearInterval(t);
  }, []);

  const searchable = cmd.kind === "search" || cmd.kind === "open" || cmd.kind === "ask";
  useEffect(() => {
    if (!searchable || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => startTransition(async () => setResults(await globalSearch(query))), 200);
    return () => clearTimeout(t);
  }, [query, searchable]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  /** Existing customer by name when it is unambiguous; otherwise a new one with that name. */
  async function resolveCustomer(name: string | null) {
    if (!name) return undefined;
    const found = await searchCustomers(name);
    const exact = found.filter((c) => c.name.trim() === name);
    const pick = exact.length === 1 ? exact[0] : found.length === 1 ? found[0] : null;
    return pick ? { id: pick.id, name: pick.name } : { id: null, name };
  }

  function run(c: ParsedCommand) {
    startRun(async () => {
      switch (c.kind) {
        case "sale":
          create({ kind: "sale", customer: await resolveCustomer(c.name), amount: c.amount, service: c.service });
          break;
        case "appointment":
          create({ kind: "appointment", customer: await resolveCustomer(c.name), date: c.date, time: c.time, service: c.service });
          break;
        case "customer":
          create({ kind: "record", entity: "customers", initial: { name: c.name, phone: c.phone } });
          break;
        case "task":
          create({ kind: "record", entity: "tasks", initial: { title: c.title, ...(c.date ? { due_date: c.date } : {}) } });
          break;
        case "open":
          router.push(c.href);
          break;
        case "add-module": {
          const res = await addComponent(c.id);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(`המודול "${c.name}" נוסף למסך העבודה`);
          router.push("/home");
          router.refresh();
          break;
        }
        case "ask":
          router.push(`/ai?q=${encodeURIComponent(c.question)}`);
          break;
        case "search":
          if (results[0]) router.push(results[0].href);
          else return;
      }
      close();
    });
  }

  const Icon = INTENT_ICONS[cmd.kind];
  const hasIntent = cmd.kind !== "search" && query.trim().length > 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        type="button"
        aria-label="שורת פקודה: חיפוש או פעולה"
        className="group flex h-9 w-full max-w-xl items-center gap-2.5 border border-border bg-module px-3 text-[13.5px] text-muted-foreground shadow-xs transition-colors hover:border-border-strong cursor-pointer"
      >
        <MagnifyingGlass className="size-4 shrink-0 transition-colors group-hover:text-brand" />
        <span className="min-w-0 flex-1 truncate text-start">
          <span className="hidden sm:inline">מה תרצה לעשות? </span>
          <span key={hint} className="text-foreground/70 animate-in fade-in duration-500">
            נסה: &quot;{EXAMPLES[hint]}&quot;
          </span>
        </span>
        <kbd dir="ltr" className="num hidden border border-border bg-rail px-1.5 py-0.5 text-[11px] text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="top-[14%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-2xl [&>button]:hidden">
          <DialogTitle className="sr-only">שורת פקודה</DialogTitle>
          <Command shouldFilter={false} loop>
            <CommandInput placeholder="כתוב מה לעשות או מה לחפש…" dir="auto" value={query} onValueChange={setQuery} autoFocus />
            <CommandList className="max-h-[60vh]">
              {hasIntent && (
                <CommandGroup heading="פעולה">
                  <CommandItem value="__intent" onSelect={() => run(cmd)} disabled={running} className="gap-3 py-3">
                    <span className="grid size-8 shrink-0 place-items-center bg-brand">
                      <Icon className="size-4 text-white" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px]">
                      <Describe cmd={cmd} />
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ArrowElbowDownLeft className="size-3.5" />
                      Enter
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}

              {!query.trim() && (
                <CommandGroup heading="אפשר לכתוב למשל">
                  {EXAMPLES.map((ex) => {
                    const ExIcon = INTENT_ICONS[parseCommand(ex, MODULES).kind];
                    return (
                      <CommandItem key={ex} value={ex} onSelect={() => setQuery(ex)}>
                        <ExIcon className="text-muted-foreground" />
                        <span dir="auto">{ex}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}

              {searchable && query.trim().length >= 2 && !results.length && (
                <CommandEmpty>{pending ? "מחפש…" : cmd.kind === "search" ? "לא נמצאו תוצאות." : null}</CommandEmpty>
              )}

              {GROUPS.map((g) => {
                const items = results.filter((r) => r.type === g.type);
                if (!items.length) return null;
                const RIcon = RESULT_ICONS[g.type];
                return (
                  <CommandGroup key={g.type} heading={g.label}>
                    {items.map((r) => (
                      <CommandItem
                        key={`${r.type}-${r.id}`}
                        value={`${r.type}-${r.id}`}
                        onSelect={() => {
                          close();
                          router.push(r.href);
                        }}
                      >
                        <RIcon />
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
