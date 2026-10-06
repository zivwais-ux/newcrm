"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CaretLeft, CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";

function useQueryUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };
}

export function SearchInput({ placeholder }: { placeholder: string }) {
  const params = useSearchParams();
  const update = useQueryUpdater();
  const [value, setValue] = useState(params.get("q") ?? "");
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (value === current) return;
    const t = setTimeout(() => update({ q: value || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative w-full sm:max-w-xs">
      <MagnifyingGlass className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        dir="auto"
        aria-label={placeholder}
        className="h-8 ps-8 text-[13px]"
      />
    </div>
  );
}

export function FilterTabs({ param, options }: { param: string; options: { value: string; label: string }[] }) {
  const params = useSearchParams();
  const update = useQueryUpdater();
  const current = params.get(param) ?? "";
  return (
    <div className="flex flex-wrap gap-0.5 rounded-sm border border-border bg-muted/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={current === o.value}
          onClick={() => update({ [param]: o.value || null })}
          className={cn(
            "h-7 cursor-pointer rounded-sm px-2.5 text-[13px] transition-colors active:translate-y-px",
            current === o.value ? "bg-module font-medium text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  className?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  if (total <= pageSize)
    return (
      <p className={cn("border-t border-border bg-rail px-3.5 py-2.5 text-xs text-muted-foreground", className)}>
        סה״כ <span className="num">{formatNumber(total)}</span>
      </p>
    );
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={cn("flex items-center justify-between gap-3 border-t border-border bg-rail px-3.5 py-2 text-xs text-muted-foreground", className)}>
      <span className="tabular">
        עמוד {formatNumber(page)} מתוך {formatNumber(pages)} · {formatNumber(from)}–{formatNumber(to)} מתוך {formatNumber(total)}
      </span>
      <div className="flex gap-1">
        <Button asChild={page > 1} size="icon-sm" variant="outline" disabled={page <= 1} aria-label="העמוד הקודם">
          {page > 1 ? (
            <Link href={href(page - 1)}>
              <CaretLeft className="rtl:-scale-x-100" />
            </Link>
          ) : (
            <CaretLeft className="rtl:-scale-x-100" />
          )}
        </Button>
        <Button asChild={page < pages} size="icon-sm" variant="outline" disabled={page >= pages} aria-label="העמוד הבא">
          {page < pages ? (
            <Link href={href(page + 1)}>
              <CaretRight className="rtl:-scale-x-100" />
            </Link>
          ) : (
            <CaretRight className="rtl:-scale-x-100" />
          )}
        </Button>
      </div>
    </div>
  );
}
