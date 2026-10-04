import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  importCta = false,
  className,
  compact = false,
}: {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  importCta?: boolean;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-8" : "py-16", className)}>
      {Icon && (
        <div className="mb-4 grid size-10 place-items-center rounded-md border bg-surface text-muted-foreground">
          <Icon className="size-4.5" />
        </div>
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {(action || importCta) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {importCta && (
            <Button asChild size="sm">
              <Link href="/data/import">
                <Upload />
                Import Data
              </Link>
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
