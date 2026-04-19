import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@fmksa/ui/lib/utils"

// Card variants — five semantic roles surface cards play in the product.
// Variants are minimally differentiated in Phase 3; later phases (dashboard,
// detail-page polish) dial the specifics as consumers adopt them. Adding
// variants now ensures callers never invent bespoke card styles at the
// page level.
//
//   - default:  general-purpose operational card (the existing look).
//   - primary:  emphasis card — left-accent in brand teal for hierarchy.
//   - summary:  dashboard summary tile (metric + delta + optional link).
//   - list:     register-list container (clean header row + tight body).
//   - evidence: compliance-grade surface — subtle teal border signals proof.
//   - support:  secondary / supporting card — muted surface, quieter chrome.
const cardVariants = cva(
  "rounded-xl text-card-foreground transition-colors",
  {
    variants: {
      variant: {
        default: "border bg-card shadow-sm",
        primary: "border border-l-[3px] border-l-brand-teal-ink bg-card shadow-sm",
        summary: "border bg-card shadow-sm",
        list: "border bg-card shadow-sm",
        evidence: "border border-brand-teal/15 bg-card shadow-sm",
        support: "border bg-surface-sunken/60 shadow-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

// CardTitle consumes the brand `heading-section` type role: 18/24 medium.
// Pre-Phase-3 callers passing `text-sm` / `text-base` / `text-lg` override
// classes will keep their sizes via tailwind-merge — this change only
// refines the DEFAULT.
const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-heading-section text-foreground", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

// CardDescription consumes the brand `body-sm` role: 13/20 regular.
const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-body-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  cardVariants,
}
