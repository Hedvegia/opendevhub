import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "../utils";

const buttonVariants = cva(
  "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-8 gap-1.5 px-3.5 has-[>svg]:px-3",
        md: "h-8 gap-1.5 px-3.5 has-[>svg]:px-3",
        icon: "size-8",
        iconOnly: "size-8",
        "icon-lg": "size-10",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        lg: "h-10 px-4 has-[>svg]:px-3.5",
        sm: "h-7 gap-1.5 px-2.5 has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
      },
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        primary: "bg-primary text-primary-foreground hover:bg-primary/85",
        attention:
          "bg-attention text-attention-foreground hover:bg-attention/85 focus-visible:ring-attention/40",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/30 dark:border-destructive/25 dark:bg-destructive/15 dark:hover:bg-destructive/25",
        ghost:
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        outline:
          "border-input bg-secondary/50 text-foreground hover:bg-accent dark:bg-secondary/35 dark:hover:bg-secondary/70",
        secondary:
          "border-input bg-secondary/50 text-foreground hover:bg-accent dark:bg-secondary/35 dark:hover:bg-secondary/70",
      },
    },
  }
);

const Button = ({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) => {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ className, size, variant }))}
      {...props}
    />
  );
};

export { Button, buttonVariants };
