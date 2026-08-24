import { cn } from "@/lib/utils";

interface CollectionHeaderProps {
  /** The page's name. Always renders at the Title step — this is the `<h1>`. */
  title: string;
  /** Optional one-line count or qualifier ("4 active"). */
  subtitle?: string;
  /** Filters, period controls, and the primary action, in that reading order. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The one header shape for a collection page — Projects, Clients, Tasks.
 *
 * These three pages are the app's navigational spine and they had drifted into
 * three different products: `text-xl` / `text-xl` / **`text-sm`** page titles,
 * two full-width pages against one centred in a 768px column, and a page header
 * on two against a bordered toolbar on the third. Moving between them meant
 * re-learning the page shape each time, and it was the one heuristic that had
 * not improved across three critiques.
 *
 * Title is `text-xl`, the Title step in DESIGN.md §3 — a page heading is a page
 * heading. Everything variable goes in `children` so a page can carry a period
 * control, three filter selects, or nothing at all without inventing its own
 * frame for them.
 */
export function CollectionHeader({
  title,
  subtitle,
  children,
  className,
}: CollectionHeaderProps) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  );
}
