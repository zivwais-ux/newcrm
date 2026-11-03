import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/85",
        brand: "bg-brand text-white shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_1px_2px_rgb(79_70_229/0.25),0_4px_12px_-4px_rgb(79_70_229/0.45)] hover:bg-brand/92 hover:shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_2px_4px_rgb(79_70_229/0.25),0_8px_18px_-6px_rgb(79_70_229/0.5)]",
        outline: "border border-border bg-module text-foreground shadow-xs hover:border-border-strong hover:bg-rail hover:shadow-sm",
        secondary: "bg-muted text-foreground hover:bg-muted/70",
        ghost: "text-foreground hover:bg-muted",
        destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90",
        link: "px-0 text-foreground underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-2.5 text-[13px]",
        xs: "h-7 rounded-sm px-2.5 text-xs",
        lg: "h-10 px-5",
        icon: "size-9",
        "icon-sm": "size-8 rounded-sm",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
