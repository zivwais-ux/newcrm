import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState as BaseEmptyState } from "@/components/ui/empty-state";

/**
 * Teaching empty state for business pages. Thin adapter over the shared
 * primitive that also offers the "upload a file" shortcut.
 */
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
    <BaseEmptyState
      icon={Icon ? <Icon /> : undefined}
      title={title}
      description={description}
      compact={compact}
      className={className}
      action={
        action || importCta ? (
          <>
            {importCta && (
              <Button asChild size="sm">
                <Link href="/data/import">
                  <Upload />
                  העלה קובץ אקסל
                </Link>
              </Button>
            )}
            {action}
          </>
        ) : undefined
      }
    />
  );
}
