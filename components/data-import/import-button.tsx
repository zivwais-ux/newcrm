"use client";

import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openImportPanel } from "./canvas-file-drop";

/**
 * "Upload a file" action. On the workspace it opens the import side panel in place;
 * elsewhere it goes to the import page. `need` (e.g. "transactions") explains what's missing.
 */
export function ImportButton({
  need,
  hint,
  label = "העלה קובץ",
  size = "sm",
  variant = "default",
}: {
  need?: string;
  hint?: string;
  label?: string;
  size?: "sm" | "default" | "xs" | "lg";
  variant?: "default" | "brand" | "outline";
}) {
  return (
    <Button asChild size={size} variant={variant}>
      <Link
        href={need ? `/data/import?for=${need}` : "/data/import"}
        onClick={(e) => {
          if (openImportPanel(hint)) e.preventDefault();
        }}
      >
        <Upload />
        {label}
      </Link>
    </Button>
  );
}
