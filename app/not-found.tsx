import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <EmptyState
        icon={<SearchX />}
        title="העמוד לא נמצא"
        description="ייתכן שהקישור שגוי או שהעמוד הועבר."
        action={
          <Button asChild size="sm">
            <Link href="/home">חזרה למסך העבודה</Link>
          </Button>
        }
      />
    </div>
  );
}
