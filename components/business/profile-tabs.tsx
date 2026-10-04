"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** URL-synced tabs (so links like ?tab=transactions work). */
export function ProfileTabs({ tabs, children }: { tabs: { value: string; label: string; count?: number }[]; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("tab") ?? tabs[0].value;
  return (
    <Tabs
      value={current}
      onValueChange={(v) => {
        const next = new URLSearchParams(params.toString());
        if (v === tabs[0].value) next.delete("tab");
        else next.set("tab", v);
        router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
      }}
    >
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
            {t.count !== undefined && <span className="text-xs font-normal text-muted-foreground tabular">{t.count}</span>}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}
