"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  detectEntities,
  type CanonicalEntity,
  type ColumnMapping,
} from "@/lib/data-mapping/canonical-schema";
import { parseFile, FileParseError, type ParsedFile } from "@/lib/data-mapping/parse-file";
import { validateRows, type ValidationResult } from "@/lib/data-mapping/validate";
import { ISSUE_LABELS, type IssueType } from "@/lib/data-mapping/transform";
import { clean } from "@/lib/data-mapping/values";
import { createImport, finalizeImport, importChunk, type ChunkStats } from "@/lib/actions/import";
import { cn } from "@/lib/utils";

type Step = "upload" | "analyze" | "map" | "validate" | "import" | "done";
const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "analyze", label: "Analyze" },
  { id: "map", label: "Map columns" },
  { id: "validate", label: "Validate" },
  { id: "import", label: "Import" },
];
const CHUNK = 500;

const ENTITY_ORDER: CanonicalEntity[] = ["customer", "transaction", "service", "lead", "deal", "activity"];

function confidenceVariant(c: number) {
  if (c >= 0.85) return "positive" as const;
  if (c >= 0.7) return "default" as const;
  return "warning" as const;
}

function Stepper({ step }: { step: Step }) {
  const index = STEPS.findIndex((s) => s.id === (step === "done" ? "import" : step));
  return (
    <ol className="mb-10 flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px]">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <span
            className={cn(
              "grid size-5 place-items-center rounded-full border text-[11px] tabular",
              i < index || step === "done" ? "border-foreground bg-foreground text-background" : i === index ? "border-foreground font-medium" : "text-muted-foreground",
            )}
          >
            {i < index || step === "done" ? <Check className="size-3" /> : i + 1}
          </span>
          <span className={cn(i === index ? "font-medium" : "text-muted-foreground")}>{s.label}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

function serializableSample(rows: ParsedFile["rows"]) {
  return rows.slice(0, 20).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : clean(v)])));
}

export function ImportWizard({ welcome }: { welcome: boolean }) {
  const router = useRouter();
  const { org } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiUsed, setAiUsed] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<(ChunkStats & { imported: number }) | null>(null);

  const entities = useMemo(() => detectEntities(mapping), [mapping]);

  const handleFile = useCallback(
    async (f: File) => {
      setError(null);
      setFile(f);
      try {
        const p = await parseFile(f);
        setParsed(p);
        setStep("analyze");

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

        const res = await fetch("/api/ai/map-columns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ headers: p.headers, sample: serializableSample(p.rows) }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "We couldn't analyze this file.");
        setMapping(json.mappings);
        setAiUsed(json.aiUsed);
        setAiNotice(json.notice);
        setStep("map");
      } catch (e) {
        setStep("upload");
        setParsed(null);
        setError(e instanceof FileParseError ? e.message : (e as Error).message || "We couldn't read this file.");
      }
    },
    [org.id],
  );

  function setTarget(column: string, target: string) {
    setMapping((m) =>
      m.map((x) => {
        if (x.column === column) return { ...x, target, confidence: 1, source: "user", reason: "Chosen by you" };
        // A canonical field can only be used once — free it from any other column.
        if (target !== CUSTOM && target !== IGNORE && x.target === target)
          return { ...x, target: CUSTOM, confidence: 0.3, source: "user", reason: "Moved — kept as custom field" };
        return x;
      }),
    );
  }

  function runValidation() {
    if (!parsed) return;
    setValidation(validateRows(parsed.rows, mapping));
    setShowIssues(false);
    setStep("validate");
  }

  async function runImport() {
    if (!parsed || !validation || !file) return;
    setStep("import");
    setProgress(2);
    const created = await createImport({
      fileName: file.name,
      fileType: parsed.fileType,
      storagePath,
      rowCount: parsed.rows.length,
      mapping,
    });
    if (!created.ok) {
      toast.error(created.error);
      setStep("validate");
      return;
    }
    const totals: ChunkStats = { customersCreated: 0, customersMatched: 0, transactions: 0, services: 0, leads: 0, deals: 0, activities: 0 };
    const records = validation.validRecords;
    for (let i = 0; i < records.length; i += CHUNK) {
      const res = await importChunk(created.data.id, records.slice(i, i + CHUNK));
      if (!res.ok) {
        toast.error(`${res.error} ${i ? `${i.toLocaleString("en-US")} rows were imported before the error.` : ""}`);
        setStep("validate");
        return;
      }
      for (const k of Object.keys(totals) as (keyof ChunkStats)[]) totals[k] += res.data[k];
      setProgress(Math.round(((i + CHUNK) / records.length) * 96));
    }
    // Services are deduplicated across chunks by the database; count distinct names.
    totals.services = new Set(records.map((r) => r.transaction?.product_or_service?.toLowerCase()).filter(Boolean)).size;
    await finalizeImport(created.data.id, {
      total: validation.total,
      imported: records.length,
      skipped: validation.total - records.length,
      ...totals,
    });
    setProgress(100);
    setResult({ ...totals, imported: records.length });
    setStep("done");
    router.refresh();
  }

  // ---------------------------------------------------------------------------
  return (
    <div>
      <Stepper step={step} />

      {step === "upload" && (
        <div className="space-y-4">
          {welcome && (
            <p className="text-sm text-muted-foreground">
              Upload your existing file as it is — any column names, Hebrew or English. We&apos;ll figure out what&apos;s inside.
            </p>
          )}
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
              "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-surface px-6 py-16 text-center transition-colors",
              dragging ? "border-brand bg-brand-soft" : "hover:border-zinc-300",
            )}
          >
            <UploadCloud className="size-7 text-muted-foreground" />
            <p className="mt-4 text-sm font-medium">Drop your file here, or click to browse</p>
            <p className="mt-1 text-[13px] text-muted-foreground">.xlsx or .csv · up to 10 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-negative-soft px-3 py-2.5 text-sm text-negative">
              <XCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            No file handy? Try <a className="underline" href="/samples/customers_and_sales.xlsx" download>a sample service-business export</a>.
          </p>
        </div>
      )}

      {step === "analyze" && (
        <div className="flex flex-col items-center py-20 text-center">
          <Loader2 className="size-6 animate-spin text-brand" />
          <p className="mt-4 text-sm font-medium">Analyzing {file?.name}…</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {parsed ? `${parsed.rows.length.toLocaleString("en-US")} rows · ${parsed.headers.length} columns. ` : ""}Understanding what each column means.
          </p>
        </div>
      )}

      {step === "map" && parsed && (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 rounded-lg border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="mt-0.5 size-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{file?.name}</p>
                <p className="text-[13px] text-muted-foreground">
                  {parsed.rows.length.toLocaleString("en-US")} rows · {parsed.headers.length} columns{parsed.sheetName ? ` · sheet “${parsed.sheetName}”` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Detected:</span>
              {ENTITY_ORDER.filter((e) => entities.includes(e)).map((e) => (
                <Badge key={e} variant="brand">
                  {ENTITY_LABELS[e]}
                </Badge>
              ))}
              {!entities.length && <Badge variant="warning">Nothing mapped yet</Badge>}
            </div>
          </div>

          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" />
            <p>
              {aiUsed ? "AI suggested how your columns map to your business data." : "We suggested how your columns map to your business data."} Review each
              suggestion — nothing is imported until you confirm.
              {aiNotice && <span className="mt-1 block text-xs">{aiNotice}</span>}
            </p>
          </div>

          <div className="rounded-lg border bg-surface">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Your column</TableHead>
                  <TableHead className="hidden md:table-cell">Sample values</TableHead>
                  <TableHead className="w-64">Maps to</TableHead>
                  <TableHead className="pr-4 text-right">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mapping.map((m) => {
                  const samples = parsed.rows
                    .map((r) => r[m.column])
                    .map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : clean(v)))
                    .filter(Boolean)
                    .slice(0, 3);
                  const field = FIELD_BY_KEY.get(m.target);
                  return (
                    <TableRow key={m.column} className={cn(m.confidence < 0.7 && m.source !== "user" && "bg-warning-soft/50")}>
                      <TableCell className="pl-4 font-medium">{m.column}</TableCell>
                      <TableCell className="hidden max-w-[260px] md:table-cell">
                        <span className="block truncate text-[13px] text-muted-foreground">{samples.join(" · ") || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <Select value={m.target} onValueChange={(v) => setTarget(m.column, v)}>
                          <SelectTrigger size="sm" aria-label={`Mapping for ${m.column}`}>
                            <SelectValue>
                              {field ? `${ENTITY_LABELS[field.entity].replace(/s$/, "")} · ${field.label}` : m.target === CUSTOM ? "Keep as custom field" : "Don't import"}
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
                            <SelectItem value={CUSTOM}>Keep as custom field</SelectItem>
                            <SelectItem value={IGNORE}>Don&apos;t import</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        {m.source === "user" ? (
                          <span className="text-xs text-muted-foreground">Set by you</span>
                        ) : (
                          <span title={m.reason} className="inline-flex flex-col items-end">
                            <Badge variant={confidenceVariant(m.confidence)} className="tabular">
                              {Math.round(m.confidence * 100)}% confidence
                            </Badge>
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                setStep("upload");
                setParsed(null);
                setMapping([]);
              }}
            >
              <ArrowLeft />
              Choose another file
            </Button>
            <Button onClick={runValidation} disabled={!entities.length}>
              Confirm mapping
              <ArrowRight />
            </Button>
          </div>
        </div>
      )}

      {step === "validate" && validation && (
        <div className="space-y-6">
          <div className="rounded-lg border bg-surface p-6">
            <p className="text-2xl font-semibold tracking-tight tabular">{validation.total.toLocaleString("en-US")} rows detected</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-positive" />
                <span className="font-medium tabular">{validation.valid.toLocaleString("en-US")}</span> valid
              </li>
              {validation.duplicates > 0 && (
                <li className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-warning" />
                  <span className="font-medium tabular">{validation.duplicates.toLocaleString("en-US")}</span> duplicates (will be skipped)
                </li>
              )}
              {(Object.entries(validation.issueCounts) as [IssueType, number][])
                .filter(([k]) => k !== "duplicate")
                .map(([k, n]) => (
                  <li key={k} className="flex items-center gap-2">
                    <AlertTriangle className="size-4 text-warning" />
                    <span className="font-medium tabular">{n.toLocaleString("en-US")}</span> {ISSUE_LABELS[k].toLowerCase()}
                  </li>
                ))}
            </ul>
            <p className="mt-4 text-[13px] text-muted-foreground">
              Will create or update:{" "}
              {ENTITY_ORDER.filter((e) => validation.entities.includes(e))
                .map((e) => ENTITY_LABELS[e].toLowerCase())
                .join(", ")}
              . Existing customers are matched by email, phone or name — never duplicated.
            </p>
          </div>

          {validation.blockers.length > 0 && (
            <div className="space-y-1 rounded-md bg-negative-soft px-4 py-3 text-sm text-negative">
              {validation.blockers.map((b) => (
                <p key={b}>{b}</p>
              ))}
            </div>
          )}

          {showIssues && validation.rowIssues.length > 0 && parsed && (
            <div className="rounded-lg border bg-surface">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Row</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead className="pr-4">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validation.rowIssues.slice(0, 150).map((ri) => (
                    <TableRow key={ri.rowIndex}>
                      <TableCell className="pl-4 text-muted-foreground tabular">{ri.rowIndex + 2}</TableCell>
                      <TableCell>
                        {ri.issues.map((i) => (
                          <Badge key={i} variant={i === "duplicate" ? "default" : "warning"} className="mr-1">
                            {ISSUE_LABELS[i]}
                          </Badge>
                        ))}
                      </TableCell>
                      <TableCell className="max-w-[420px] pr-4">
                        <span className="block truncate text-xs text-muted-foreground">
                          {parsed.headers
                            .map((h) => {
                              const v = parsed.rows[ri.rowIndex][h];
                              return v instanceof Date ? v.toISOString().slice(0, 10) : clean(v);
                            })
                            .join(" · ")}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {validation.rowIssues.length > 150 && (
                <p className="px-4 py-2 text-xs text-muted-foreground">Showing the first 150 of {validation.rowIssues.length.toLocaleString("en-US")} rows with issues.</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep("map")}>
              <ArrowLeft />
              Back to mapping
            </Button>
            <div className="flex gap-2">
              {validation.rowIssues.length > 0 && (
                <Button variant="outline" onClick={() => setShowIssues((s) => !s)}>
                  {showIssues ? "Hide issues" : "Review issues"}
                </Button>
              )}
              <Button onClick={runImport} disabled={!validation.valid || validation.blockers.length > 0}>
                Import {validation.valid.toLocaleString("en-US")} valid records
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === "import" && (
        <div className="mx-auto max-w-md py-16 text-center">
          <p className="text-sm font-medium">Importing your data…</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Creating customers, transactions and services. Please keep this tab open.</p>
          <Progress value={progress} className="mt-6" />
          <p className="mt-2 text-xs text-muted-foreground tabular">{progress}%</p>
        </div>
      )}

      {step === "done" && result && (
        <div className="mx-auto max-w-lg py-8 text-center">
          <CheckCircle2 className="mx-auto size-9 text-positive" />
          <h2 className="mt-4 text-xl font-semibold tracking-tight">Your data is ready</h2>
          <p className="mt-1 text-sm text-muted-foreground">{result.imported.toLocaleString("en-US")} records imported into your business model.</p>
          <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border text-left sm:grid-cols-3">
            {[
              { label: "New customers", value: result.customersCreated },
              { label: "Matched customers", value: result.customersMatched },
              { label: "Transactions", value: result.transactions },
              { label: "Services", value: result.services },
              { label: "Leads", value: result.leads },
              { label: "Deals", value: result.deals },
              { label: "Activities", value: result.activities },
            ]
              .filter((s) => s.value > 0)
              .map((s) => (
                <div key={s.label} className="bg-surface p-4">
                  <p className="text-lg font-semibold tabular">{s.value.toLocaleString("en-US")}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <Button asChild size="lg">
              <Link href="/components?imported=1">
                See recommended Components
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/customers">View customers</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
