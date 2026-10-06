"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarBlank, X } from "@phosphor-icons/react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RANGE_PRESETS } from "@/lib/analytics/dates";
import { activeFilterKeys, filterLabel, parseFilters, type WorkspaceFilters } from "@/lib/components/filters";
import type { FilterKey } from "@/lib/components/types";

const FILTER_NAMES: Record<FilterKey, string> = { range: "תאריכים", service: "שירות", stage: "שלב עסקה" };

/** Read and write the shared workspace filters (URL search params). */
export function useWorkspaceFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  /** Sets a filter; selecting the active value again clears it. */
  const toggle = useCallback(
    (key: FilterKey, value: string | null) => setParams({ [key]: value && filters[key] === value ? null : value }),
    [filters, setParams],
  );

  return { filters, setParams, toggle };
}

/**
 * Opens the Customer Spotlight on the Home canvas; elsewhere navigates to the
 * full profile. Lets every Component hand a customer to the rest of the workspace.
 */
export function useOpenCustomer() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return useCallback(
    (id: string) => {
      if (pathname !== "/home") return router.push(`/customers/${id}`);
      const next = new URLSearchParams(params.toString());
      next.set("customer", id);
      router.replace(`/home?${next}`, { scroll: false });
    },
    [params, pathname, router],
  );
}

export function CustomerLink({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const open = useOpenCustomer();
  return (
    <button type="button" onClick={() => open(id)} className={className ?? "block max-w-full truncate text-start font-medium hover:underline cursor-pointer"}>
      {children}
    </button>
  );
}

export function FilterBar({ filters }: { filters?: WorkspaceFilters }) {
  const { filters: live, setParams } = useWorkspaceFilters();
  const f = filters ?? live;
  const chips = activeFilterKeys(f).filter((k) => k !== "range");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={f.range ?? "component"} onValueChange={(v) => setParams({ range: v === "component" ? null : v })}>
        <SelectTrigger size="sm" className="w-auto min-w-44 bg-module" aria-label="טווח תאריכים לכל המסך">
          <CalendarBlank className="size-3.5 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="component">כל כלי לפי הטווח שלו</SelectItem>
          {Object.entries(RANGE_PRESETS).map(([k, label]) => (
            <SelectItem key={k} value={k}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {chips.map((k) => (
        <span key={k} className="inline-flex h-8 items-center gap-1.5 border border-brand bg-brand-soft pe-1 ps-2.5 text-xs font-medium text-brand">
          <span className="size-1.5 rounded-full bg-brand" />
          {filterLabel(k, f[k] as string)}
          <button onClick={() => setParams({ [k]: null })} className="grid size-6 place-items-center hover:bg-brand/10 cursor-pointer" aria-label={`נקה סינון לפי ${FILTER_NAMES[k]}`}>
            <X className="size-3" weight="bold" />
          </button>
        </span>
      ))}
      {chips.length > 0 && (
        <button onClick={() => setParams({ service: null, stage: null })} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">
          נקה הכל
        </button>
      )}
      {chips.length === 0 && (
        <span className="hidden text-xs text-muted-foreground md:inline">לחיצה על שירות או על שלב עסקה מסננת את כל המודולים המחוברים.</span>
      )}
    </div>
  );
}
