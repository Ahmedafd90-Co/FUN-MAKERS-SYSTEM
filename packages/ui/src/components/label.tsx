"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@fmksa/ui/lib/utils"

// Label variants mirror the brand `label` type role (11/16 weight-500
// tracking +0.08em UPPERCASE). Keeping the pre-existing `default`
// preserves all existing form callsites exactly; `label` opts into the
// refined chrome treatment. `onDark` tints for glass surfaces without
// hardcoded color classes at the call site.
// `text-label` is a font-size/weight/letter-spacing token from the brand
// type scale. It does NOT include `text-transform: uppercase` because
// Tailwind's fontSize config cannot set text-transform — we apply
// `uppercase` explicitly alongside it.
const labelVariants = cva(
  "leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
  {
    variants: {
      variant: {
        /** Pre-existing look: body-sized medium weight. Preserved so
         *  current forms render unchanged. */
        default: "text-sm font-medium",
        /** Refined brand-chrome label: tiny uppercase tracked. */
        label: "text-label uppercase",
        /** Glass-surface label — same typography as `label` with
         *  glass-label color from the brand layer. */
        onDark: "text-label uppercase text-glass-label",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, variant, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants({ variant }), className)}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label, labelVariants }
