import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ImportWizard } from "@/components/data-import/import-wizard";
import { param, type SearchParams } from "@/lib/params";

export const metadata = { title: "Import data" };

export default async function ImportPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <PageContainer className="max-w-4xl">
      <Link href="/data" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" />
        Data
      </Link>
      <PageHeader title="Import your business data" description="Bring in customers, sales, leads, deals or appointments from Excel or CSV." />
      <ImportWizard welcome={param(params, "welcome") === "1"} />
    </PageContainer>
  );
}
