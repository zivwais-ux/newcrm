"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { detectFormat } from "@/lib/data-mapping/parse-file";
import { cn } from "@/lib/utils";
import { ImportWizard } from "./import-wizard";

export const OPEN_IMPORT_EVENT = "bos:open-import";
let panelMounted = 0;

/** Opens the import panel from anywhere on the page (e.g. an empty tool's "upload a file" button). */
export function openImportPanel(hint?: string) {
  if (!panelMounted) return false;
  window.dispatchEvent(new CustomEvent(OPEN_IMPORT_EVENT, { detail: { hint } }));
  return true;
}

/**
 * Lets the owner drop an Excel/CSV/contacts file anywhere on the workspace. The file is read,
 * summarized and imported in a side panel; the tools on the canvas refresh with the new data.
 */
export function CanvasFileDrop({ onImported }: { onImported?: (updatedTypes: string[]) => void }) {
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [hint, setHint] = useState<string | undefined>();
  const [session, setSession] = useState(0);
  const depth = useRef(0);
  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const start = useCallback((f: File | null, h?: string) => {
    setFile(f);
    setHint(h);
    setSession((s) => s + 1);
    setOpen(true);
  }, []);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    };
    const overFn = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = 0;
      setOver(false);
      // A drop zone inside the panel already handled it.
      if (e.defaultPrevented || openRef.current) return e.preventDefault();
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) start(f);
    };
    const openEvent = (e: Event) => start(null, (e as CustomEvent<{ hint?: string }>).detail?.hint);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overFn);
    window.addEventListener("drop", drop);
    window.addEventListener(OPEN_IMPORT_EVENT, openEvent);
    panelMounted++;
    return () => {
      panelMounted--;
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overFn);
      window.removeEventListener("drop", drop);
      window.removeEventListener(OPEN_IMPORT_EVENT, openEvent);
    };
  }, [start]);

  return (
    <>
      <div
        aria-hidden={!over}
        className={cn(
          "pointer-events-none fixed inset-0 z-50 grid place-items-center bg-brand/10 p-6 backdrop-blur-[2px] transition-opacity duration-150",
          over && !open ? "opacity-100" : "opacity-0",
        )}
      >
        <div
          className={cn(
            "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-brand bg-surface/95 px-10 py-9 text-center shadow-xl transition-transform duration-150",
            over ? "scale-100" : "scale-95",
          )}
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
            <FileSpreadsheet className="size-7" />
          </span>
          <p className="text-lg font-bold">שחרר כדי להעלות את הקובץ</p>
          <p className="text-[13px] text-muted-foreground">אקסל, CSV, Google Sheets או אנשי קשר — הנתונים ייפרסו לכלים שבמסך</p>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>העלאת נתונים</SheetTitle>
            <SheetDescription>
              {file && !detectFormat(file.name) ? "סוג הקובץ לא נתמך — נסה אקסל, CSV או vcf." : "הנתונים ייפרסו אוטומטית לכלים שבמסך העבודה שלך."}
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="overflow-y-auto">
            <ImportWizard
              key={session}
              compact
              hint={hint}
              initialFile={file}
              onDone={(updated) => {
                setOpen(false);
                router.refresh();
                onImported?.(updated);
              }}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
