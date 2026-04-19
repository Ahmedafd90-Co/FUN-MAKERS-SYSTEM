import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@fmksa/ui/lib/utils"

// Input variants:
//   - default: standard operational input on light surfaces.
//   - onDark:  glass input rendered on the dark anchor backdrop
//              (sign-in, forgot-password, 404 with form). Consumes the
//              glass-surface tokens from @fmksa/brand — no hardcoded
//              white/4, white/10 values at page level.
//
// Typography defaults to `text-body` (14/22 regular) for both variants.
// md:text-sm preserved so iOS does not zoom on focus at 16px.
const inputVariants = cva(
  "flex h-9 w-full rounded-md border px-3 py-1 text-body shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  {
    variants: {
      variant: {
        default:
          "border-input bg-transparent text-foreground placeholder:text-muted-foreground focus-visible:ring-ring",
        onDark:
          "border-glass-input-border bg-glass-input-bg text-glass-input-fg placeholder:text-glass-placeholder focus-visible:ring-[hsl(var(--brand-teal)/0.55)] focus-visible:border-[hsl(var(--brand-teal))] focus-visible:ring-offset-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface InputProps
  extends React.ComponentProps<"input">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ variant }), className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input, inputVariants }
