import { cn } from "@/lib/utils";
import { Module, ModuleBody, ModuleRail } from "@/components/ui/module";

/** Card = a Module on the table. Kept as a thin alias so existing callers speak the module language. */
export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <Module data-slot="card" className={className} {...props} />;
}

/** Card header = the module rail (icon, title, actions), with an optional description line under it. */
export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      <ModuleRail icon={icon} title={title} actions={actions} className={className} />
      {description && <p className="px-4 pt-4 text-[13px] leading-relaxed text-muted-foreground sm:px-5">{description}</p>}
    </>
  );
}

export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <ModuleBody className={cn(className)} {...props} />;
}
