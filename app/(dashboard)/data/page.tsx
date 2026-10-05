import Link from "next/link";
import { ClipboardPaste, Contact, Database, FileSpreadsheet, FileText, Link2, Upload } from "lucide-react";
import { requireOrg } from "@/lib/supabase/server";
import { getDataCounts } from "@/lib/analytics/queries";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/utils";

export const metadata = { title: "הנתונים שלי" };

const ENTITY_LINKS = [
  { key: "customers", label: "לקוחות", href: "/customers" },
  { key: "transactions", label: "מכירות", href: "/transactions" },
  { key: "services", label: "שירותים", href: "/transactions" },
  { key: "leads", label: "פניות", href: "/leads" },
  { key: "deals", label: "עסקאות", href: "/deals" },
  { key: "activities", label: "פעילות", href: "/activities" },
  { key: "tasks", label: "משימות", href: "/tasks" },
] as const;

const STATUS: Record<string, { label: string; variant: "positive" | "negative" | "warning" }> = {
  completed: { label: "הושלם", variant: "positive" },
  failed: { label: "נכשל", variant: "negative" },
  importing: { label: "בתהליך", variant: "warning" },
  uploaded: { label: "הועלה", variant: "warning" },
  analyzed: { label: "נותח", variant: "warning" },
};

const WAYS = [
  { icon: FileSpreadsheet, title: "קובץ אקסל", text: "xlsx, xls, ODS, Numbers — כולל כמה גיליונות בקובץ אחד" },
  { icon: FileText, title: "CSV או טקסט", text: "גם קבצים בעברית מתוכנות ישנות" },
  { icon: Link2, title: "Google Sheets", text: "מדביקים קישור שיתוף — וזהו" },
  { icon: ClipboardPaste, title: "הדבקת טבלה", text: "מעתיקים מאקסל ומדביקים" },
  { icon: Contact, title: "אנשי קשר מהנייד", text: "קובץ vcf מהטלפון או מ־Google Contacts" },
];

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

  return (
    <PageContainer>
      <PageHeader
        title="הנתונים שלי"
        description="כל הנתונים של העסק במקום אחד — מכאן כל הכלים במסך העבודה מקבלים את המידע."
        actions={
          <Button asChild variant="brand">
            <Link href="/data/import">
              <Upload />
              העלאת נתונים
            </Link>
          </Button>
        }
      />
      <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {ENTITY_LINKS.map((e) => (
          <Link key={e.key} href={e.href} className="rounded-xl border bg-surface p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-xl font-bold tabular">{formatNumber(counts[e.key])}</p>
            <p className="text-xs text-muted-foreground">{e.label}</p>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 text-base font-semibold">אפשר להעלות נתונים מ…</h2>
      <div className="mb-10 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {WAYS.map((w) => (
          <Link key={w.title} href="/data/import" className="group flex items-start gap-3 rounded-xl border bg-surface p-3.5 shadow-xs transition-all hover:border-brand/30 hover:shadow-md">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
              <w.icon className="size-4" />
            </span>
            <span>
              <span className="block text-[13px] font-semibold">{w.title}</span>
              <span className="block text-xs leading-snug text-muted-foreground">{w.text}</span>
            </span>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 text-base font-semibold">היסטוריית העלאות</h2>
      {imports?.length ? (
        <div className="overflow-hidden rounded-xl border bg-surface shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="ps-4">קובץ</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead className="hidden sm:table-cell">שורות</TableHead>
                <TableHead className="hidden md:table-cell">מה יובא</TableHead>
                <TableHead className="pe-4 text-end">תאריך</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((f) => {
                const stats = (f.stats ?? {}) as Record<string, number>;
                const status = STATUS[f.status] ?? { label: f.status, variant: "warning" as const };
                return (
                  <TableRow key={f.id}>
                    <TableCell className="ps-4">
                      <span className="flex items-center gap-2 font-medium" dir="auto">
                        {f.file_type === "excel" ? <FileSpreadsheet className="size-4 text-muted-foreground" /> : <FileText className="size-4 text-muted-foreground" />}
                        {f.file_name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="hidden tabular sm:table-cell">{f.row_count != null ? formatNumber(f.row_count) : "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {stats.imported !== undefined
                        ? `${formatNumber(stats.imported)} שורות · ${formatNumber(stats.customersCreated ?? 0)} לקוחות חדשים · ${formatNumber(stats.transactions ?? 0)} מכירות`
                        : "—"}
                    </TableCell>
                    <TableCell className="pe-4 text-end text-muted-foreground">{formatDate(f.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-xl border bg-surface shadow-sm">
          <EmptyState
            icon={<Database />}
            title="עוד לא העלית נתונים"
            description="העלה את קובץ הלקוחות או המכירות שיש לך — כמו שהוא. אנחנו נבין מה יש בו ונפרוס אותו לכלים שלך."
            action={
              <Button asChild variant="brand">
                <Link href="/data/import">
                  <Upload />
                  העלה קובץ
                </Link>
              </Button>
            }
          />
        </div>
      )}
    </PageContainer>
  );
}
