import { Skeleton } from "@/components/ui/skeleton";
import { Module } from "@/components/ui/module";

/** Shaped like a list page: header, then one module with a rail and rows. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pt-6 pb-28 sm:px-8" aria-busy aria-label="טוען…">
      <div className="mb-6 space-y-2.5 sm:mb-8">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Module>
        <div className="flex min-h-11 items-center gap-2.5 border-b border-border bg-rail px-3.5">
          <Skeleton className="size-4" />
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="ms-auto h-7 w-40" />
        </div>
        <div className="divide-y divide-border/60">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex h-12 items-center gap-4 px-3.5">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="ms-auto h-3 w-16" />
            </div>
          ))}
        </div>
      </Module>
    </div>
  );
}
