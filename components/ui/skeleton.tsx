import { cn } from "@/lib/utils";

/** Stone placeholder with a slow, subtle pulse, shaped by the caller like the final layout. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-sm bg-border/55 [animation-duration:1.8s] motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Skeleton };
