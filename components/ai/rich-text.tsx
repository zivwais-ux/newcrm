import { Fragment } from "react";

/** Minimal, safe renderer for the analyst's plain-text answers: paragraphs, "- " bullets, **bold**. */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function RichText({ text }: { text: string }) {
  const blocks: { type: "p" | "ul"; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      blocks.push({ type: "p", lines: [] });
      continue;
    }
    const bullet = /^\s*(?:[-*•]|\d+\.)\s+/.test(line);
    const last = blocks.at(-1);
    if (bullet) {
      const content = line.replace(/^\s*[-*•]\s+/, "");
      if (last?.type === "ul") last.lines.push(content);
      else blocks.push({ type: "ul", lines: [content] });
    } else if (last?.type === "p" && last.lines.length) last.lines.push(line);
    else blocks.push({ type: "p", lines: [line] });
  }
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-zinc-700">
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.type === "ul" ? (
            <ul key={i} className="space-y-1.5 pl-1">
              {b.lines.map((l, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-[9px] size-1 shrink-0 rounded-full bg-zinc-400" />
                  <span>{inline(l)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p key={i}>{inline(b.lines.join(" "))}</p>
          ),
        )}
    </div>
  );
}
