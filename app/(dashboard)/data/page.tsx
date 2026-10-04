import Link from "next/link";
import { Database, FileSpreadsheet, FileText, Sparkles, Upload } from "lucide-react";
import { requireOrg } from "@/lib/supabase/server";
import { getDataCounts } from "@/lib/analytics/queries";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/business/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadDemoButton } from "@/components/data-import/load-demo-button";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Data" };

const ENTITY_LINKS = [
  { key: "customers", label: "Customers", href: "/customers" },
  { key: "transactions", label: "Transactions", href: "/transactions" },
  { key: "services", label: "Services", href: "/transactions" },
  { key: "leads", label: "Leads", href: "/leads" },
  { key: "deals", label: "Deals", href: "/deals" },
  { key: "activities", label: "Activities", href: "/activities" },
  { key: "tasks", label: "Tasks", href: "/tasks" },
] as const;

export default async function DataPage() {
  const { supabase, org } = await requireOrg();
  const [counts, { data: imports }] = await Promise.all([
    getDataCounts(supabase, org.id),
    supabase
      .from("imported_files")
      .select("id, file_name, file_type, status, row_count, stats, created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const empty = Object.values(counts).every((n) => !n);

  return (
    <PageContainer>
      <PageHeader
        title="Data"
        description="Your canonical business data — the single source every Component reads from."
        actions={
          <Button asChild size="sm">
            <Link href="/data/import">
              <Upload />
              Import data
            </Link>
          </Button>
        }
      />
      <div className="mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4 lg:grid-cols-7">
        {ENTITY_LINKS.map((e) => (
          <Link key={e.key} href={e.href} className="bg-surface p-4 transition-colors hover:bg-muted/40">
            <p className="text-xl font-semibold tabular">{counts[e.key].toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{e.label}</p>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 text-base font-semibold">Imports</h2>
      {imports?.length ? (
        <div className="rounded-lg border bg-surface">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Rows</TableHead>
                <TableHead className="hidden md:table-cell">Imported</TableHead>
                <TableHead className="pr-4 text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((f) => {
                const stats = (f.stats ?? {}) as Record<string, number>;
                return (
                  <TableRow key={f.id}>
                    <TableCell className="pl-4">
                      <span className="flex items-center gap-2 font-medium">
                        {f.file_type === "excel" ? <FileSpreadsheet className="size-4 text-muted-foreground" /> : <FileText className="size-4 text-muted-foreground" />}
                        {f.file_name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={f.status === "completed" ? "positive" : f.status === "failed" ? "negative" : "warning"} className="capitalize">
                        {f.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden tabular sm:table-cell">{f.row_count?.toLocaleString() ?? "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {stats.imported !== undefined
                        ? `${stats.imported.toLocaleString()} records · ${stats.customersCreated ?? 0} new customers · ${stats.transactions ?? 0} transactions`
                        : "—"}
                    </TableCell>
                    <TableCell className="pr-4 text-right text-muted-foreground">{formatDate(f.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={Database}
          title="No imports yet"
          description="Upload a CSV or Excel export from your current tools. The system maps it to your business model."
          importCta
        />
      )}

      {empty && (
        <div className="mt-10 flex flex-col gap-3 rounded-lg border border-dashed p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-4 text-brand" />
            <div>
              <p className="text-sm font-medium">Just exploring?</p>
              <p className="text-sm text-muted-foreground">Load a realistic sample dataset into this empty workspace.</p>
            </div>
          </div>
          <LoadDemoButton />
        </div>
      )}
    </PageContainer>
  );
}
