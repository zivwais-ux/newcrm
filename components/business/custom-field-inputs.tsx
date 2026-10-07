"use client";

import { Check } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FieldDef } from "@/lib/fields";
import { cn } from "@/lib/utils";

const NONE = "__none__";

/** "₪" for ILS, "$" for USD… (falls back to the code). */
export function currencySymbol(currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Form value for a stored value: strings for inputs, string[] for multiselect, boolean for checkbox. */
export function toFormValue(def: FieldDef, stored: unknown): unknown {
  if (stored === null || stored === undefined) return def.type === "multiselect" ? [] : def.type === "checkbox" ? false : "";
  if (def.type === "multiselect") return Array.isArray(stored) ? stored.map(String) : String(stored).split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  if (def.type === "checkbox") return stored === true || stored === "true";
  return String(stored);
}

/** Inputs for the business's own fields, one per definition, laid out in the record form's 2-column grid. */
export function CustomFieldInputs({
  defs,
  values,
  currency,
  onChange,
}: {
  defs: FieldDef[];
  values: Record<string, unknown>;
  currency: string;
  onChange: (key: string, value: unknown) => void;
}) {
  if (!defs.length) return null;
  return (
    <>
      <div className="col-span-2 border-t border-border pt-3">
        <p className="text-[13px] font-medium text-muted-foreground">השדות שלי</p>
      </div>
      {defs.map((def) => {
        const id = `cf-${def.key}`;
        const value = values[def.key] ?? toFormValue(def, null);
        const wide = def.type === "multiselect" || def.type === "text";
        return (
          <div key={def.key} className={wide ? "col-span-2 space-y-1.5" : "col-span-2 space-y-1.5 sm:col-span-1"}>
            {def.type === "checkbox" ? (
              <label htmlFor={id} className="flex h-full min-h-9 cursor-pointer items-center gap-2 pt-5 text-sm font-medium">
                <Checkbox id={id} checked={value === true} onCheckedChange={(v) => onChange(def.key, v === true)} />
                <span dir="auto">{def.label}</span>
              </label>
            ) : (
              <>
                <Label htmlFor={id}>
                  <span dir="auto">{def.label}</span>
                </Label>
                <FieldControl id={id} def={def} value={value} currency={currency} onChange={(v) => onChange(def.key, v)} />
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

function FieldControl({ id, def, value, currency, onChange }: { id: string; def: FieldDef; value: unknown; currency: string; onChange: (v: unknown) => void }) {
  switch (def.type) {
    case "select": {
      const current = typeof value === "string" ? value : "";
      // A value from an import may not be one of the suggested options; keep it selectable.
      const options = current && !def.options.includes(current) ? [...def.options, current] : def.options;
      return (
        <Select value={current || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="בחר" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>
              <span className="text-muted-foreground">בלי בחירה</span>
            </SelectItem>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "multiselect": {
      const list = Array.isArray(value) ? (value as string[]) : [];
      const options = [...def.options, ...list.filter((v) => !def.options.includes(v))];
      return (
        <div id={id} role="group" aria-label={def.label} className="flex flex-wrap gap-1.5">
          {options.map((o) => {
            const active = list.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(active ? list.filter((x) => x !== o) : [...list, o])}
                className={cn(
                  "inline-flex h-7 cursor-pointer items-center gap-1 rounded-sm border px-2 text-xs transition-colors active:translate-y-px",
                  active ? "border-brand bg-brand-soft font-medium text-brand" : "border-border bg-module hover:border-border-strong hover:bg-muted/60",
                )}
              >
                {active && <Check className="size-3" weight="bold" />}
                <span dir="auto">{o}</span>
              </button>
            );
          })}
        </div>
      );
    }
    case "money":
      return (
        <div className="relative">
          <Input
            id={id}
            type="number"
            dir="ltr"
            inputMode="decimal"
            step="0.01"
            className="ps-8 text-end"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-[13px] text-muted-foreground" dir="ltr">
            {currencySymbol(currency)}
          </span>
        </div>
      );
    case "number":
      return <Input id={id} type="number" dir="ltr" inputMode="decimal" step="any" className="text-end" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <Input id={id} type="date" dir="ltr" className="text-end" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    case "phone":
      return <Input id={id} type="tel" dir="ltr" className="text-end" maxLength={40} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <Input id={id} dir="auto" maxLength={500} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }
}
