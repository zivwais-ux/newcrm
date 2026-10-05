"use client";

import { useEffect, useState } from "react";

export function Greeting({ name }: { name: string }) {
  const [part, setPart] = useState<string | null>(null);
  useEffect(() => {
    const h = new Date().getHours();
    setPart(h < 5 ? "לילה טוב" : h < 12 ? "בוקר טוב" : h < 17 ? "צהריים טובים" : h < 21 ? "ערב טוב" : "לילה טוב");
  }, []);
  return (
    <h1 className="text-[26px] font-bold tracking-tight">
      {part ?? "שלום"}, {name}
    </h1>
  );
}
