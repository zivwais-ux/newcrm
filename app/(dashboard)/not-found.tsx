import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <EmptyState
        icon={<SearchX />}
        title="לא מצאנו את מה שחיפשת"
        description="ייתכן שזה נמחק, או שזה שייך לחשבון שאין לך גישה אליו."
        action={
          <Button asChild size="sm">
            <Link href="/home">חזרה לבית</Link>
          </Button>
        }
      />
    </div>
  );
}
