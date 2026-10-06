"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  Contact,
  FileSpreadsheet,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Ltr } from "@/components/ui/ltr";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/layout/workspace-provider";
import {
  CANONICAL_FIELDS,
  CUSTOM,
  ENTITY_LABELS,
  FIELD_BY_KEY,
  IGNORE,
  type CanonicalEntity,
  type ColumnMapping,
} from "@/lib/data-mapping/canonical-schema";
import {
  ACCEPT_ATTR,
  FileParseError,
  parsePastedText,
  parseWorkbook,
  parseWorkbookBuffer,
  type ParsedFile,
  type ParsedWorkbook,
} from "@/lib/data-mapping/parse-file";
import { validateRows, type ValidationResult } from "@/lib/data-mapping/validate";
import { ISSUE_LABELS, type IssueType } from "@/lib/data-mapping/transform";
import { clean, nameKey } from "@/lib/data-mapping/values";
import {
  createImport,
  fetchGoogleSheet,
  finalizeImport,
  getSpreadSummary,
  importChunk,
  type ChunkStats,
  type SpreadSummary,
} from "@/lib/actions/import";
import { addComponent } from "@/lib/actions/components";
import { cn, formatCurrency, formatDate, formatNumber } from "@/lib/utils";

type Step = "upload" | "reading" | "summary" | "importing" | "done";
type Source = "file" | "paste" | "gsheet";

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "העלאה" },
  { id: "summary", label: "מה מצאנו" },
  { id: "done", label: "הנתונים נפרסו" },
];
const CHUNK = 500;
const MAX_SHEETS = 8;
const ENTITY_ORDER: CanonicalEntity[] = ["customer", "transaction", "service", "lead", "deal", "activity"];
const EMPTY_TOTALS: ChunkStats = {
  customersCreated: 0,
  customersMatched: 0,
  transactions: 0,
  services: 0,
  leads: 0,
  deals: 0,
  activities: 0,
  existingSkipped: 0,
};

interface SheetPlan {
  id: string;
  sheet: ParsedFile;
  mapping: ColumnMapping[];
  include: boolean;
  showMapping: boolean;
  aiUsed: boolean;
}

interface SheetSummary {
  customers: number;
  sales: number;
  revenue: number;
  from: string | null;
  to: string | null;
  services: number;
  leads: number;
  deals: number;
  activities: number;
}

function summarize(v: ValidationResult): SheetSummary {
  const customers = new Set<string>();
  const services = new Set<string>();
  let sales = 0;
  let revenue = 0;
  let from: string | null = null;
  let to: string | null = null;
  let leads = 0;
  let deals = 0;
  let activities = 0;
  for (const r of v.validRecords) {
    if (r.customer) customers.add(nameKey(r.customer.name));
    if (r.transaction) {
      sales++;
      revenue += r.transaction.amount;
      if (!from || r.transaction.date < from) from = r.transaction.date;
      if (!to || r.transaction.date > to) to = r.transaction.date;
      if (r.transaction.product_or_service) services.add(r.transaction.product_or_service.toLowerCase());
    }
    if (r.lead) leads++;
    if (r.deal) deals++;
    if (r.activity) activities++;
  }
  return { customers: customers.size, sales, revenue, from, to, services: services.size, leads, deals, activities };
}

function confidenceVariant(c: number) {
  if (c >= 0.85) return "positive" as const;
  if (c >= 0.7) return "default" as const;
  return "warning" as const;
}

function serializableSample(rows: ParsedFile["rows"]) {
  return rows.slice(0, 20).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : clean(v)])));
}

function base64ToBuffer(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function needsReview(plan: SheetPlan, v: ValidationResult) {
  return v.blockers.length > 0 || plan.mapping.some((m) => FIELD_BY_KEY.has(m.target) && m.source !== "user" && m.confidence < 0.7);
}

function Stepper({ step }: { step: Step }) {
  const at = step === "upload" || step === "reading" ? 0 : step === "summary" || step === "importing" ? 1 : 2;
  return (
    <ol className="mb-8 flex items-center gap-2 text-[13px]">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full text-[11px] font-semibold tabular transition-colors",
              i < at ? "bg-brand text-white" : i === at ? "bg-brand-soft text-brand ring-1 ring-brand/30" : "bg-muted text-muted-foreground",
            )}
          >
            {i < at ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className={cn(i === at ? "font-semibold" : "text-muted-foreground")}>{s.label}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

/** One line in the "what we found" summary. */
function Fact({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2.5">
      <p className="text-lg font-bold leading-tight tabular">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function ImportWizard({
  welcome = false,
  hint,
  initialFile,
  compact = false,
  onDone,
}: {
  welcome?: boolean;
  /** Plain-language note on what data a tool needs (e.g. coming from an empty tool). */
  hint?: string;
  /** A file dropped elsewhere (e.g. on the canvas) — start reading it right away. */
  initialFile?: File | null;
  compact?: boolean;
  /** Called from the final screen instead of navigating (when shown inside a panel). */
  onDone?: (updatedTypes: string[]) => void;
}) {
  const router = useRouter();
  const { org } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const startedWith = useRef<File | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [source, setSource] = useState<Source>("file");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [sheetLink, setSheetLink] = useState("");
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [plans, setPlans] = useState<SheetPlan[]>([]);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [issuesFor, setIssuesFor] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ChunkStats & { imported: number; revenue: number }>({ ...EMPTY_TOTALS, imported: 0, revenue: 0 });
  const [spread, setSpread] = useState<SpreadSummary | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  const validations = useMemo(() => new Map(plans.map((p) => [p.id, validateRows(p.sheet.rows, p.mapping)])), [plans]);
  const included = plans.filter((p) => p.include);
  const importable = included.reduce((n, p) => n + (validations.get(p.id)?.valid ?? 0), 0);
  const blocked = included.some((p) => (validations.get(p.id)?.blockers.length ?? 0) > 0);

  /** Reads every sheet, asks the mapper (AI when available) about each, and builds the plan. */
  const analyze = useCallback(async (workbook: ParsedWorkbook, name: string) => {
    setSourceName(name);
    setStep("reading");
    const sheets = workbook.sheets.slice(0, MAX_SHEETS);
    const results = await Promise.all(
      sheets.map(async (sheet, i) => {
        const res = await fetch("/api/ai/map-columns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ headers: sheet.headers, sample: serializableSample(sheet.rows) }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "לא הצלחנו לנתח את הקובץ.");
        if (json.notice) setAiNotice(json.notice);
        const plan: SheetPlan = { id: `${i}-${sheet.sheetName ?? "sheet"}`, sheet, mapping: json.mappings, include: true, showMapping: false, aiUsed: json.aiUsed };
        return plan;
      }),
    );
    // A sheet that maps to nothing useful starts unchecked; review opens where we're unsure.
    for (const p of results) {
      const v = validateRows(p.sheet.rows, p.mapping);
      p.include = v.entities.length > 0;
      p.showMapping = p.include && needsReview(p, v);
    }
    if (!results.some((p) => p.include) && results[0]) {
      results[0].include = true;
      results[0].showMapping = true;
    }
    setPlans(results);
    setStep("summary");
  }, []);

  const fail = useCallback((e: unknown) => {
    setStep("upload");
    setPlans([]);
    setError(e instanceof FileParseError ? e.message : (e as Error)?.message || "לא הצלחנו לקרוא את הקובץ.");
  }, []);

  const handleFile = useCallback(
    async (f: File) => {
      setError(null);
      setFile(f);
      setStoragePath(null);
      try {
        const workbook = await parseWorkbook(f);
        // Keep the original file in private, org-scoped storage. Best effort: never blocks the import.
        try {
          const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-80);
          const path = `${org.id}/${crypto.randomUUID()}-${safe}`;
          createClient()
            .storage.from("imports")
            .upload(path, f, { upsert: false, contentType: f.type || undefined })
            .then(({ error }) => setStoragePath(error ? null : path))
            .catch(() => setStoragePath(null));
        } catch {
          setStoragePath(null);
        }
        await analyze(workbook, f.name);
      } catch (e) {
        fail(e);
      }
    },
    [analyze, fail, org.id],
  );

  useEffect(() => {
    if (initialFile && startedWith.current !== initialFile) {
      startedWith.current = initialFile;
      handleFile(initialFile);
    }
  }, [initialFile, handleFile]);

  async function handlePaste() {
    setError(null);
    setFile(null);
    try {
      await analyze(parsePastedText(pasteText), "טבלה שהודבקה");
    } catch (e) {
      fail(e);
    }
  }

  async function handleSheetLink() {
    setError(null);
    setFile(null);
    setStep("reading");
    const res = await fetchGoogleSheet(sheetLink.trim());
    if (!res.ok) return fail(new Error(res.error));
    try {
      await analyze(await parseWorkbookBuffer(base64ToBuffer(res.data.base64), "gsheet"), res.data.title);
    } catch (e) {
      fail(e);
    }
  }

  function updatePlan(id: string, patch: Partial<SheetPlan>) {
    setPlans((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function setTarget(planId: string, column: string, target: string) {
    setPlans((ps) =>
      ps.map((p) =>
        p.id !== planId
          ? p
          : {
              ...p,
              mapping: p.mapping.map((x) => {
                if (x.column === column) return { ...x, target, confidence: 1, source: "user", reason: "נבחר על ידך" };
                // A business field can only be used once — free it from any other column.
                if (target !== CUSTOM && target !== IGNORE && x.target === target)
                  return { ...x, target: CUSTOM, confidence: 0.3, source: "user", reason: "הועבר — יישמר כשדה נוסף" };
                return x;
              }),
            },
      ),
    );
  }

  async function runImport() {
    const work = included.filter((p) => (validations.get(p.id)?.valid ?? 0) > 0);
    if (!work.length) return;
    setStep("importing");
    setProgress(2);
    const totals: ChunkStats = { ...EMPTY_TOTALS };
    const serviceNames = new Set<string>();
    let revenue = 0;
    let imported = 0;
    const totalRows = work.reduce((n, p) => n + validations.get(p.id)!.valid, 0);
    let done = 0;

    for (const plan of work) {
      const validation = validations.get(plan.id)!;
      const records = validation.validRecords;
      const multi = plans.length > 1;
      const created = await createImport({
        fileName: (multi && plan.sheet.sheetName ? `${sourceName} · ${plan.sheet.sheetName}` : sourceName).slice(0, 255),
        fileType: plan.sheet.fileType,
        storagePath,
        rowCount: plan.sheet.rows.length,
        mapping: plan.mapping,
      });
      if (!created.ok) {
        toast.error(created.error);
        setStep("summary");
        return;
      }
      const sheetTotals: ChunkStats = { ...EMPTY_TOTALS };
      for (let i = 0; i < records.length; i += CHUNK) {
        const res = await importChunk(created.data.id, records.slice(i, i + CHUNK));
        if (!res.ok) {
          toast.error(`${res.error}${done + i ? ` ${formatNumber(done + i)} שורות כבר יובאו לפני השגיאה.` : ""}`);
          setStep("summary");
          return;
        }
        for (const k of Object.keys(sheetTotals) as (keyof ChunkStats)[]) sheetTotals[k] += res.data[k] ?? 0;
        setProgress(Math.min(97, Math.round(((done + i + CHUNK) / totalRows) * 96)));
      }
      // Services are deduplicated across chunks by the database; count distinct names.
      const sheetServices = new Set(records.map((r) => r.transaction?.product_or_service?.toLowerCase()).filter((s): s is string => !!s));
      sheetTotals.services = sheetServices.size;
      sheetServices.forEach((s) => serviceNames.add(s));
      await finalizeImport(created.data.id, {
        total: validation.total,
        imported: records.length,
        skipped: validation.total - records.length,
        customersCreated: sheetTotals.customersCreated,
        customersMatched: sheetTotals.customersMatched,
        transactions: sheetTotals.transactions,
        services: sheetTotals.services,
        leads: sheetTotals.leads,
        deals: sheetTotals.deals,
        activities: sheetTotals.activities,
      });
      for (const k of Object.keys(totals) as (keyof ChunkStats)[]) totals[k] += sheetTotals[k];
      revenue += summarize(validation).revenue;
      imported += records.length;
      done += records.length;
    }
    totals.services = serviceNames.size;
    setProgress(100);
    setResult({ ...totals, imported, revenue });
    const summary = await getSpreadSummary();
    setSpread(summary.ok ? summary.data : null);
    setStep("done");
    router.refresh();
  }

  async function addToCanvas(type: string) {
    setAdding(type);
    const res = await addComponent(type);
    setAdding(null);
    if (!res.ok) return toast.error(res.error);
    setAdded((s) => new Set(s).add(type));
  }

  function finish() {
    const updated = [...(spread?.onCanvas.filter((c) => c.ready).map((c) => c.type) ?? []), ...added];
    if (onDone) return onDone(updated);
    router.push(updated.length ? `/home?updated=${updated.join(",")}` : "/home");
  }

  /** What each tool on the canvas now shows, in one plain line. */
  function spreadLine(type: string): string {
    const r = result;
    switch (type) {
      case "customer-hub":
        return r.customersCreated + r.customersMatched ? `${formatNumber(r.customersCreated)} לקוחות חדשים, ${formatNumber(r.customersMatched)} עודכנו` : "מעודכן";
      case "revenue-intelligence":
        return r.transactions ? `${formatCurrency(r.revenue, org.currency)} ב־${formatNumber(r.transactions)} מכירות` : "מעודכן";
      case "repeat-customers":
        return "חושב מחדש לפי היסטוריית הקניות";
      case "customer-risk":
        return "בדק מחדש מי הפסיק לקנות";
      case "activities":
        return r.activities ? `${formatNumber(r.activities)} פגישות ופעילויות` : "מעודכן";
      case "sales-pipeline":
      case "deal-risk":
        return r.deals ? `${formatNumber(r.deals)} עסקאות` : "מעודכן";
      case "followup-radar":
        return "רשימת המעקב עודכנה";
      case "ai-analyst":
        return "מוכן לענות על שאלות על הנתונים החדשים";
      default:
        return "מעודכן";
    }
  }

  // ---------------------------------------------------------------------------
  return (
    <div>
      {!compact && <Stepper step={step} />}

      {step === "upload" && (
        <div className="space-y-4">
          {(welcome || hint) && (
            <p className="rounded-lg bg-brand-soft/60 px-4 py-3 text-sm text-foreground">
              {hint ?? "העלה את הקובץ שיש לך, כמו שהוא — כל שמות עמודות, בעברית או באנגלית. אנחנו נבין מה יש בו ונפרוס אותו לכלים שלך."}
            </p>
          )}

          <div className="inline-flex rounded-lg bg-muted p-1 text-[13px]" role="tablist">
            {(
              [
                ["file", "קובץ", UploadCloud],
                ["paste", "הדבקת טבלה", ClipboardPaste],
                ["gsheet", "Google Sheets", Link2],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={source === id}
                onClick={() => setSource(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all cursor-pointer",
                  source === id ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>

          {source === "file" && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={cn(
                "group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-surface px-6 text-center transition-all",
                compact ? "py-10" : "py-16",
                dragging ? "scale-[1.01] border-brand bg-brand-soft" : "border-border hover:border-brand/40 hover:bg-brand-soft/30",
              )}
            >
              <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand ring-1 ring-brand/10 transition-transform group-hover:-translate-y-0.5">
                <UploadCloud className="size-6" />
              </span>
              <p className="mt-4 text-[15px] font-semibold">גרור לכאן קובץ, או לחץ לבחירה</p>
              <p className="mt-1 text-[13px] text-muted-foreground">אקסל (xlsx, xls), ‏CSV, ‏Google Sheets, ‏Numbers, ‏ODS או אנשי קשר מהטלפון (vcf) · עד 10MB</p>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5 text-[11px] text-muted-foreground">
                {[
                  [FileSpreadsheet, "כמה גיליונות בקובץ אחד"],
                  [Sparkles, "מזהה עמודות בעברית"],
                  [Contact, "אנשי קשר מהנייד"],
                ].map(([Icon, label]) => {
                  const I = Icon as typeof FileSpreadsheet;
                  return (
                    <span key={label as string} className="inline-flex items-center gap-1 rounded-sm border bg-surface px-2 py-0.5">
                      <I className="size-3" />
                      {label as string}
                    </span>
                  );
                })}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT_ATTR}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {source === "paste" && (
            <div className="space-y-3 rounded-xl border bg-surface p-4">
              <p className="text-[13px] text-muted-foreground">סמן את הטבלה באקסל או ב־Google Sheets (כולל שורת הכותרות), העתק (Ctrl+C) והדבק כאן (Ctrl+V).</p>
              <Textarea
                dir="auto"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"שם\tטלפון\tתאריך\tסכום\nדנה כהן\t050-1234567\t12/03/2026\t450"}
                className="min-h-40 font-mono text-xs"
              />
              <div className="flex justify-end">
                <Button onClick={handlePaste} disabled={!pasteText.trim()}>
                  קרא את הטבלה
                </Button>
              </div>
            </div>
          )}

          {source === "gsheet" && (
            <div className="space-y-3 rounded-xl border bg-surface p-4">
              <p className="text-[13px] text-muted-foreground">
                ב־Google Sheets לחץ “שיתוף” ← “כל מי שיש לו את הקישור”, העתק את הקישור והדבק כאן. נייבא את כל הלשוניות.
              </p>
              <div className="flex gap-2">
                <Input
                  dir="ltr"
                  value={sheetLink}
                  onChange={(e) => setSheetLink(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  className="flex-1"
                  onKeyDown={(e) => e.key === "Enter" && sheetLink.trim() && handleSheetLink()}
                />
                <Button onClick={handleSheetLink} disabled={!sheetLink.trim()}>
                  ייבא
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-negative-soft px-3 py-2.5 text-sm text-negative">
              <XCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
        </div>
      )}

      {step === "reading" && (
        <div className="flex flex-col items-center py-20 text-center">
          <span className="relative grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
            <Sparkles className="size-6" />
            <Loader2 className="absolute -end-1 -bottom-1 size-5 animate-spin rounded-full bg-surface p-0.5 text-brand" />
          </span>
          <p className="mt-5 text-[15px] font-semibold">קורא את {sourceName || file?.name || "הנתונים"}…</p>
          <p className="mt-1 text-[13px] text-muted-foreground">מזהה גיליונות, עמודות ותאריכים, ומבין מה כל עמודה אומרת.</p>
        </div>
      )}

      {step === "summary" && (
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <Sparkles className="size-4" />
            </span>
            <div>
              <h2 className="text-lg font-bold">הנה מה שמצאנו ב־{sourceName}</h2>
              <p className="text-[13px] text-muted-foreground">
                {plans.length > 1 ? `${formatNumber(plans.length)} גיליונות. סמן מה לייבא. ` : ""}שום דבר לא נשמר עד שתאשר.
                {aiNotice && <span className="mt-0.5 block text-xs">{aiNotice}</span>}
              </p>
            </div>
          </div>

          {plans.map((plan) => {
            const v = validations.get(plan.id)!;
            const s = summarize(v);
            const skipped = v.total - v.valid;
            const kinds = ENTITY_ORDER.filter((e) => v.entities.includes(e)).map((e) => ENTITY_LABELS[e]);
            return (
              <section key={plan.id} className={cn("rounded-xl border bg-surface shadow-sm transition-opacity", !plan.include && "opacity-60")}>
                <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
                  {plans.length > 1 && (
                    <Checkbox checked={plan.include} onCheckedChange={(c) => updatePlan(plan.id, { include: c === true })} aria-label={`ייבא את ${plan.sheet.sheetName}`} />
                  )}
                  <FileSpreadsheet className="size-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{plan.sheet.sheetName ?? sourceName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(plan.sheet.rows.length)} שורות · {formatNumber(plan.sheet.headers.length)} עמודות
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {kinds.length ? kinds.map((k) => <Badge key={k} variant="brand">{k}</Badge>) : <Badge variant="warning">לא זוהו נתונים עסקיים</Badge>}
                  </div>
                </header>

                {plan.include && (
                  <div className="space-y-4 p-4">
                    {v.valid > 0 && (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {s.customers > 0 && <Fact value={formatNumber(s.customers)} label="לקוחות" />}
                        {s.sales > 0 && <Fact value={formatNumber(s.sales)} label="מכירות" />}
                        {s.sales > 0 && <Fact value={<Ltr>{formatCurrency(s.revenue, org.currency)}</Ltr>} label="סך ההכנסות" />}
                        {s.services > 0 && <Fact value={formatNumber(s.services)} label="שירותים / מוצרים" />}
                        {s.leads > 0 && <Fact value={formatNumber(s.leads)} label="פניות" />}
                        {s.deals > 0 && <Fact value={formatNumber(s.deals)} label="עסקאות" />}
                        {s.activities > 0 && <Fact value={formatNumber(s.activities)} label="פגישות ופעילויות" />}
                      </div>
                    )}
                    {s.from && s.to && (
                      <p className="text-[13px] text-muted-foreground">
                        מכירות מ־{formatDate(s.from)} עד {formatDate(s.to)}
                      </p>
                    )}

                    {skipped > 0 && (
                      <button
                        type="button"
                        onClick={() => setIssuesFor(issuesFor === plan.id ? null : plan.id)}
                        className="flex w-full items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-start text-[13px] text-warning cursor-pointer"
                      >
                        <AlertTriangle className="size-4 shrink-0" />
                        <span className="flex-1">
                          נדלג על {formatNumber(skipped)} שורות{v.duplicates ? ` (מתוכן ${formatNumber(v.duplicates)} כפולות)` : ""} — לחץ לפירוט
                        </span>
                        <ChevronDown className={cn("size-4 transition-transform", issuesFor === plan.id && "rotate-180")} />
                      </button>
                    )}
                    {issuesFor === plan.id && v.rowIssues.length > 0 && (
                      <div className="max-h-72 overflow-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="ps-3">שורה</TableHead>
                              <TableHead>מה הבעיה</TableHead>
                              <TableHead className="pe-3">נתונים</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {v.rowIssues.slice(0, 150).map((ri) => (
                              <TableRow key={ri.rowIndex}>
                                <TableCell className="ps-3 text-muted-foreground tabular">{ri.rowIndex + 2}</TableCell>
                                <TableCell>
                                  {ri.issues.map((i: IssueType) => (
                                    <Badge key={i} variant={i === "duplicate" ? "default" : "warning"} className="me-1">
                                      {ISSUE_LABELS[i]}
                                    </Badge>
                                  ))}
                                </TableCell>
                                <TableCell className="max-w-[360px] pe-3">
                                  <span dir="auto" className="block truncate text-xs text-muted-foreground">
                                    {plan.sheet.headers.map((h) => clean(plan.sheet.rows[ri.rowIndex][h])).join(" · ")}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {v.blockers.length > 0 && (
                      <div className="space-y-1 rounded-lg bg-negative-soft px-3 py-2.5 text-[13px] text-negative">
                        {v.blockers.map((b) => (
                          <p key={b}>{b}</p>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => updatePlan(plan.id, { showMapping: !plan.showMapping })}
                      className="flex items-center gap-1.5 text-[13px] font-medium text-brand cursor-pointer"
                    >
                      <ChevronDown className={cn("size-4 transition-transform", plan.showMapping && "rotate-180")} />
                      {plan.showMapping ? "הסתר את התאמת העמודות" : "בדוק התאמת עמודות"}
                      {!plan.showMapping && needsReview(plan, v) && <Badge variant="warning">כדאי לבדוק</Badge>}
                    </button>

                    {plan.showMapping && (
                      <div className="overflow-hidden rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="ps-3">העמודה שלך</TableHead>
                              <TableHead className="hidden md:table-cell">דוגמאות</TableHead>
                              <TableHead className="w-60">מה זה</TableHead>
                              <TableHead className="pe-3 text-end">ביטחון</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {plan.mapping.map((m) => {
                              const samples = plan.sheet.rows
                                .map((r) => clean(r[m.column]))
                                .filter(Boolean)
                                .slice(0, 3);
                              const field = FIELD_BY_KEY.get(m.target);
                              return (
                                <TableRow key={m.column} className={cn(m.confidence < 0.7 && m.source !== "user" && field && "bg-warning-soft/50")}>
                                  <TableCell className="ps-3 font-medium" dir="auto">
                                    {m.column}
                                  </TableCell>
                                  <TableCell className="hidden max-w-[220px] md:table-cell">
                                    <span dir="auto" className="block truncate text-[13px] text-muted-foreground">
                                      {samples.join(" · ") || "—"}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <Select value={m.target} onValueChange={(t) => setTarget(plan.id, m.column, t)}>
                                      <SelectTrigger size="sm" aria-label={`מה זו העמודה ${m.column}`}>
                                        <SelectValue>
                                          {field ? `${ENTITY_LABELS[field.entity]} · ${field.label}` : m.target === CUSTOM ? "שמור כשדה נוסף" : "אל תייבא"}
                                        </SelectValue>
                                      </SelectTrigger>
                                      <SelectContent>
                                        {ENTITY_ORDER.map((entity) => (
                                          <SelectGroup key={entity}>
                                            <SelectLabel>{ENTITY_LABELS[entity]}</SelectLabel>
                                            {CANONICAL_FIELDS.filter((f) => f.entity === entity).map((f) => (
                                              <SelectItem key={f.key} value={f.key}>
                                                {f.label}
                                              </SelectItem>
                                            ))}
                                          </SelectGroup>
                                        ))}
                                        <SelectSeparator />
                                        <SelectItem value={CUSTOM}>שמור כשדה נוסף</SelectItem>
                                        <SelectItem value={IGNORE}>אל תייבא</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell className="pe-3 text-end">
                                    {m.source === "user" ? (
                                      <span className="text-xs text-muted-foreground">נבחר על ידך</span>
                                    ) : (
                                      <Badge variant={confidenceVariant(m.confidence)} className="tabular" title={m.reason}>
                                        <Ltr>{Math.round(m.confidence * 100)}%</Ltr>
                                      </Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                        <p className="border-t bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                          {plan.aiUsed ? "ההתאמה הוצעה על ידי AI." : "ההתאמה הוצעה אוטומטית."} לקוחות קיימים מזוהים לפי טלפון, מייל או שם — בלי כפילויות.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setStep("upload");
                setPlans([]);
              }}
            >
              <ArrowLeft className="rtl:-scale-x-100" />
              קובץ אחר
            </Button>
            <Button size="lg" variant="brand" onClick={runImport} disabled={!importable || blocked}>
              {importable ? `ייבא ${formatNumber(importable)} שורות` : "אין מה לייבא"}
            </Button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="mx-auto max-w-md py-16 text-center">
          <p className="text-[15px] font-semibold">מייבא ופורס את הנתונים לכלים שלך…</p>
          <p className="mt-1 text-[13px] text-muted-foreground">יוצר לקוחות, מכירות ושירותים. השאר את החלון פתוח.</p>
          <Progress value={progress} className="mt-6" />
          <p className="mt-2 text-xs text-muted-foreground tabular">
            <Ltr>{progress}%</Ltr>
          </p>
        </div>
      )}

      {step === "done" && (
        <div className={cn("mx-auto space-y-6", compact ? "" : "max-w-2xl")}>
          <div className="text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-positive-soft text-positive ring-1 ring-positive/15">
              <CheckCircle2 className="size-7" />
            </span>
            <h2 className="mt-4 text-xl font-bold">הנתונים נפרסו במסך העבודה שלך</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatNumber(result.imported)} שורות יובאו
              {result.existingSkipped ? ` · דילגנו על ${formatNumber(result.existingSkipped)} מכירות שכבר היו במערכת` : ""}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "לקוחות חדשים", value: result.customersCreated },
              { label: "לקוחות שעודכנו", value: result.customersMatched },
              { label: "מכירות", value: result.transactions },
              { label: "שירותים", value: result.services },
              { label: "פניות", value: result.leads },
              { label: "עסקאות", value: result.deals },
              { label: "פגישות ופעילויות", value: result.activities },
            ]
              .filter((x) => x.value > 0)
              .map((x) => (
                <Fact key={x.label} value={formatNumber(x.value)} label={x.label} />
              ))}
          </div>

          {spread && spread.onCanvas.length > 0 && (
            <section className="rounded-xl border bg-surface shadow-sm">
              <h3 className="border-b px-4 py-3 text-sm font-semibold">מה התעדכן במסך העבודה</h3>
              <ul className="divide-y">
                {spread.onCanvas.map((c) => (
                  <li key={c.type} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    <span className={cn("grid size-5 place-items-center rounded-full", c.ready ? "bg-positive text-white" : "bg-muted text-muted-foreground")}>
                      {c.ready ? <Check className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}
                    </span>
                    <span className="font-medium">{c.name}</span>
                    <span className="ms-auto text-muted-foreground">{c.ready ? spreadLine(c.type) : "עדיין חסרים לו נתונים"}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {spread && spread.unlocked.length > 0 && (
            <section className="rounded-xl border border-brand/20 bg-brand-soft/40 p-4">
              <h3 className="text-sm font-semibold">{spread.onCanvas.length ? "כלים חדשים שמוכנים לעבוד עם הנתונים" : "מסך העבודה עוד ריק — הכלים האלה מוכנים לעבוד עם הנתונים שלך"}</h3>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {spread.unlocked.map((u) => (
                  <li key={u.type} className="flex items-start gap-3 rounded-lg border bg-surface p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold">{u.name}</p>
                      <p className="text-xs leading-snug text-muted-foreground">{u.description}</p>
                    </div>
                    {added.has(u.type) ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-positive">
                        <Check className="size-3.5" />
                        במסך
                      </span>
                    ) : (
                      spread.canManage && (
                        <Button size="xs" variant="outline" onClick={() => addToCanvas(u.type)} disabled={adding === u.type}>
                          {adding === u.type ? <Loader2 className="animate-spin" /> : <Plus />}
                          הוסף למסך
                        </Button>
                      )
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-wrap justify-center gap-2">
            <Button size="lg" variant="brand" onClick={finish}>
              {compact ? "סגור וראה את המסך" : "למסך העבודה"}
            </Button>
            {!compact && (
              <Button asChild size="lg" variant="outline">
                <Link href="/customers">לרשימת הלקוחות</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
