import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The one busy indicator.
 *
 * Every loading state used to hand-roll `<Loader2 className="… animate-spin" />`,
 * which drifted to five sizes (h-3, h-3.5, h-4, size-4, h-5) for three actual
 * jobs. The sizes below are those three jobs, named.
 *
 * A spinner says "this specific action is working". For a *surface* that hasn't
 * loaded yet, prefer `Skeleton` — it holds the layout instead of collapsing it.
 */
const spinnerVariants = cva("shrink-0 animate-spin", {
  variants: {
    size: {
      /** Inline in a compact control — row actions, small buttons. */
      sm: "h-3.5 w-3.5",
      /** Inline in a default-size button, matching its own icon sizing. */
      default: "h-4 w-4",
      /** A whole panel or route is loading; usually centered and muted. */
      lg: "h-5 w-5",
    },
  },
  defaultVariants: {
    size: "default",
  },
})

interface SpinnerProps
  // `size` is omitted from the icon's own props (where it means a pixel value)
  // so the variant below owns the name — one spelling, three allowed answers.
  extends Omit<React.ComponentProps<typeof Loader2>, "ref" | "size">,
    VariantProps<typeof spinnerVariants> {
  /** Announced to assistive tech. Omit only when adjacent text already says it. */
  label?: string
}

function Spinner({ className, size, label, ...props }: SpinnerProps) {
  return (
    <Loader2
      data-slot="spinner"
      role="status"
      aria-label={label}
      // Decorative when nothing labels it — the surrounding button or text
      // already carries the meaning, and a second announcement is noise.
      aria-hidden={label ? undefined : true}
      className={cn(spinnerVariants({ size }), className)}
      {...props}
    />
  )
}

export { Spinner }
