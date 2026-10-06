import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ImportWizard } from "@/components/data-import/import-wizard";
import { param, type SearchParams } from "@/lib/params";
import { ENTITY_SINGULAR } from "@/lib/components/registry";
import type { EntityName } from "@/types/domain";

export const metadata = { title: "העלאת נתונים" };

export default async function ImportPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const need = param(params, "for");
  const hint = need && need in ENTITY_SINGULAR ? `כדי שהכלי יעבוד צריך נתוני ${ENTITY_SINGULAR[need as EntityName]}. העלה קובץ שיש בו אותם — כל פורמט, כל שמות עמודות.` : undefined;
  return (
    <PageContainer className="max-w-3xl">
      <Link href="/data" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <CaretLeft className="size-3.5 rtl:-scale-x-100" />
        הנתונים שלי
      </Link>
      <PageHeader title="העלאת נתונים" description="לקוחות, מכירות, פניות, עסקאות או פגישות — מאקסל, CSV, Google Sheets או אנשי הקשר בטלפון." />
      <ImportWizard welcome={param(params, "welcome") === "1"} hint={hint} />
    </PageContainer>
  );
}
