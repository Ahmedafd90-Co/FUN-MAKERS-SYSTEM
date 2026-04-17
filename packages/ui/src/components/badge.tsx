import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@fmksa/ui/lib/utils"

// Badge type scale comes from the brand theme (`typography.scale.badge`):
// 11/16 weight-500 tracking +0.04em uppercase. The `text-badge-sm` Tailwind
// class maps to that role. Badges are the highest-frequency chrome element
// in the product — refined tracking pulls them in line with brand chrome.
//
// Status-specific variants (`draft`, `inReview`, `approved`, etc.) are
// rendered elsewhere via ProcurementStatusBadge; this primitive exposes the
// shadcn-default set plus the pre-existing `subtle` variant.
const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-badge-sm uppercase transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
        subtle:
          "border-border/60 bg-muted text-foreground/75 hover:bg-muted/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
