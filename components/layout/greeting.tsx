"use client";

import { useEffect, useState } from "react";

export function Greeting({ name }: { name: string }) {
  const [part, setPart] = useState<string | null>(null);
  useEffect(() => {
    const h = new Date().getHours();
    setPart(h < 5 ? "לילה טוב" : h < 12 ? "בוקר טוב" : h < 17 ? "צהריים טובים" : h < 21 ? "ערב טוב" : "לילה טוב");
  }, []);
  const today = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" }).format(new Date());
  return (
    <div>
      <p className="text-[13px] text-muted-foreground" suppressHydrationWarning>
        {today}
      </p>
      <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">
        {part ?? "שלום"}, {name}
      </h1>
    </div>
  );
}
