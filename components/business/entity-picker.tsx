"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { searchCustomers, searchDeals } from "@/lib/actions/search";

type Option = { id: string; name: string; subtitle: string | null };

/** Searchable picker for customers or deals (server-side search, never loads everything). */
export function EntityPicker({
  kind,
  value,
  initialLabel,
  onChange,
  placeholder,
}: {
  kind: "customer" | "deal";
  value: string | null;
  initialLabel?: string | null;
  onChange: (id: string | null, label: string | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [label, setLabel] = useState<string | null>(initialLabel ?? null);
  const [pending, startTransition] = useTransition();
  const noun = kind === "customer" ? { pick: "בחר לקוח", search: "חיפוש לקוח…", none: "לא נמצאו לקוחות" } : { pick: "בחר עסקה", search: "חיפוש עסקה…", none: "לא נמצאו עסקאות" };

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      startTransition(async () => {
        setOptions(await (kind === "customer" ? searchCustomers(query) : searchDeals(query)));
      });
    }, 180);
    return () => clearTimeout(t);
  }, [open, query, kind]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-surface px-3 text-start text-sm shadow-xs cursor-pointer"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? label ?? "נבחר" : placeholder ?? noun.pick}
          </span>
          <span className="flex items-center gap-1">
            {value && (
              <span
                role="button"
                tabIndex={0}
                aria-label="נקה"
                onClick={(e) => {
                  e.stopPropagation();
                  setLabel(null);
                  onChange(null, null);
                }}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent"
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={noun.search} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{pending ? "מחפש…" : noun.none}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.id}
                  onSelect={() => {
                    setLabel(o.name);
                    onChange(o.id, o.name);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", value === o.id ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.name}</span>
                    {o.subtitle && <span className="block truncate text-xs text-muted-foreground">{o.subtitle}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
