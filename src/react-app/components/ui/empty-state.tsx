import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  className?: string
}

export function EmptyState({ icon: Icon, title, description, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center",
        className
      )}
    >
      <Icon className="mb-4 h-10 w-10 text-muted-foreground/30" />
      <h3 className="font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  )
}
