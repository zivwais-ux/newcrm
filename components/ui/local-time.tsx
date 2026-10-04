"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/utils";

/** Renders a timestamp in the viewer's timezone. Server output is a neutral placeholder to avoid hydration mismatch. */
export function LocalDateTime({ value }: { value: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => setText(formatDateTime(value)), [value]);
  return <time dateTime={value}>{text ?? " "}</time>;
}
