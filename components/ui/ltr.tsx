import { cn } from "@/lib/utils";

/** Keeps an LTR run (amount, phone, email, English) intact inside Hebrew text. */
export function Ltr({ className, ...props }: React.ComponentProps<"span">) {
  return <span dir="ltr" className={cn("ltr", className)} {...props} />;
}
