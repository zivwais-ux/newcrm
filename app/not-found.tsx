import Link from "next/link";
import { MagnifyingGlassMinus } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Module, ModuleRail } from "@/components/ui/module";

export default function NotFound() {
  return (
    <div className="dot-grid grain flex min-h-screen items-center justify-center bg-table px-4">
      <Module className="w-full max-w-md">
        <ModuleRail title="404" />
        <EmptyState
          icon={<MagnifyingGlassMinus />}
          title="העמוד לא נמצא"
          description="ייתכן שהקישור שגוי או שהעמוד הועבר."
          action={
            <Button asChild size="sm">
              <Link href="/home">חזרה למסך העבודה</Link>
            </Button>
          }
        />
      </Module>
    </div>
  );
}
