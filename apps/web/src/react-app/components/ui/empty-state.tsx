import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
  /**
   * Heading level for the title. Defaults to `h2`.
   *
   * It was a hard-coded `h3`, which skipped a level under every page's `<h1>`
   * — and not only on the collection pages: `CardTitle` renders a `div` by
   * default, so an empty state inside a report card had no `h2` above it
   * either. Every empty state in the app was one, and each is a heading-order
   * break for anyone navigating by headings.
   *
   * `h2` is safe as the default because repeating a level is valid where
   * skipping one is not; pass `h3` only where a real `h2` actually precedes.
   */
  as?: "h2" | "h3"
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  as: Heading = "h2",
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex animate-scale-in flex-col items-center justify-center py-16 text-center",
        className
      )}
    >
      <Icon className="mb-4 h-10 w-10 text-muted-foreground/30" />
      <Heading className="font-semibold">{title}</Heading>
      {description && (
        <p className="mt-1 max-w-[60ch] text-sm text-balance text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
