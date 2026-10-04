"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Blocks, Handshake, Receipt, Search, UserPlus, Users } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { globalSearch, type SearchResult } from "@/lib/actions/search";

const ICONS = { customer: Users, lead: UserPlus, deal: Handshake, transaction: Receipt, component: Blocks } as const;
const GROUPS: { type: SearchResult["type"]; label: string }[] = [
  { type: "customer", label: "Customers" },
  { type: "lead", label: "Leads" },
  { type: "deal", label: "Deals" },
  { type: "transaction", label: "Transactions" },
  { type: "component", label: "Components" },
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
        className="flex h-8 w-full max-w-sm items-center gap-2 rounded-md border bg-surface px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-zinc-300 cursor-pointer"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search customers, deals, components…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl [&>button]:hidden">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search your business…" value={query} onValueChange={setQuery} autoFocus />
            <CommandList>
              {query.trim().length >= 2 && (
                <CommandEmpty>{pending ? "Searching…" : "No results found."}</CommandEmpty>
              )}
              {query.trim().length < 2 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">Type at least two characters.</p>
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
