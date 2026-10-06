import Link from "next/link";
import { AddressBook, ClipboardText, ClockCounterClockwise, Database, FileText, FileXls, LinkSimple, SquaresFour, UploadSimple } from "@phosphor-icons/react/dist/ssr";
import { canManage, requireOrg } from "@/lib/supabase/server";
import { DeleteImportButton } from "@/components/data-import/delete-import-button";
import { getDataCounts } from "@/lib/analytics/queries";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Module, ModuleRail } from "@/components/ui/module";
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
  { icon: FileXls, title: "קובץ אקסל", text: "xlsx, xls, ODS, Numbers — כולל כמה גיליונות בקובץ אחד" },
  { icon: FileText, title: "CSV או טקסט", text: "גם קבצים בעברית מתוכנות ישנות" },
  { icon: LinkSimple, title: "Google Sheets", text: "מדביקים קישור שיתוף — וזהו" },
  { icon: ClipboardText, title: "הדבקת טבלה", text: "מעתיקים מאקסל ומדביקים" },
  { icon: AddressBook, title: "אנשי קשר מהנייד", text: "קובץ vcf מהטלפון או מ־Google Contacts" },
];

export default async function DataPage() {
  const { supabase, org, role } = await requireOrg();
  const manage = canManage(role);
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
              <UploadSimple />
              העלאת נתונים
            </Link>
          </Button>
        }
      />
      <div className="space-y-6">
        <Module>
          <ModuleRail index={1} icon={<Database />} title="מה יש במערכת" />
          <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 lg:grid-cols-7">
            {ENTITY_LINKS.map((e) => (
              <Link key={e.key} href={e.href} className="group bg-module p-4 transition-colors hover:bg-rail">
                <p className="num text-2xl font-medium">{formatNumber(counts[e.key])}</p>
                <p className="text-xs text-muted-foreground transition-colors group-hover:text-foreground">{e.label}</p>
              </Link>
            ))}
            <div aria-hidden className="bg-module lg:hidden" />
          </div>
        </Module>

        <Module>
          <ModuleRail index={2} icon={<SquaresFour />} title="אפשר להעלות נתונים מ…" />
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
            {WAYS.map((w) => (
              <Link key={w.title} href="/data/import" className="group flex items-start gap-3 bg-module p-4 transition-colors hover:bg-rail">
                <span className="grid size-8 shrink-0 place-items-center rounded-sm border border-brand/15 bg-brand-soft text-brand">
                  <w.icon className="size-4" />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold">{w.title}</span>
                  <span className="block text-xs leading-snug text-muted-foreground">{w.text}</span>
                </span>
              </Link>
            ))}
            <div aria-hidden className="hidden bg-module sm:block lg:hidden" />
          </div>
        </Module>

        <Module>
          <ModuleRail
            index={3}
            icon={<ClockCounterClockwise />}
            title="היסטוריית העלאות"
            meta={imports?.length ? <span className="num">{formatNumber(imports.length)}</span> : undefined}
          />
          {imports?.length ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="ps-4">קובץ</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead className="hidden sm:table-cell">שורות</TableHead>
                  <TableHead className="hidden md:table-cell">מה יובא</TableHead>
                  <TableHead className={manage ? "text-end" : "pe-4 text-end"}>תאריך</TableHead>
                  {manage && (
                    <TableHead className="w-12 pe-2">
                      <span className="sr-only">פעולות</span>
                    </TableHead>
                  )}
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
                          {f.file_type === "excel" ? <FileXls className="size-4 text-muted-foreground" /> : <FileText className="size-4 text-muted-foreground" />}
                          {f.file_name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="num hidden sm:table-cell">{f.row_count != null ? formatNumber(f.row_count) : "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {stats.imported !== undefined
                          ? `${formatNumber(stats.imported)} שורות · ${formatNumber(stats.customersCreated ?? 0)} לקוחות חדשים · ${formatNumber(stats.transactions ?? 0)} מכירות`
                          : "—"}
                      </TableCell>
                      <TableCell className={manage ? "text-end text-muted-foreground tabular" : "pe-4 text-end text-muted-foreground tabular"}>{formatDate(f.created_at)}</TableCell>
                      {manage && (
                        <TableCell className="pe-2 text-end">
                          <DeleteImportButton id={f.id} fileName={f.file_name} />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<Database />}
              title="עוד לא העלית נתונים"
              description="העלה את קובץ הלקוחות או המכירות שיש לך — כמו שהוא. אנחנו נבין מה יש בו ונפרוס אותו לכלים שלך."
              action={
                <Button asChild variant="brand">
                  <Link href="/data/import">
                    <UploadSimple />
                    העלה קובץ
                  </Link>
                </Button>
              }
            />
          )}
        </Module>
      </div>
    </PageContainer>
  );
}
