"use client";

import { useEffect, useState } from "react";

export function Greeting({ name }: { name: string }) {
  const [part, setPart] = useState<string | null>(null);
  useEffect(() => {
    const h = new Date().getHours();
    setPart(h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);
  return (
    <h1 className="text-[26px] font-semibold tracking-tight">
      {part ?? "Hello"}, {name}
    </h1>
  );
}
