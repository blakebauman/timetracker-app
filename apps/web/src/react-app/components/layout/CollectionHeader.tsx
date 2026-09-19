import { PaneActions, PaneHeader, PaneTitle } from "./Pane";

interface CollectionHeaderProps {
  /** The page's name. Always the `<h1>`, at the pane title's 24px bold. */
  title: string;
  /** Optional one-line count or qualifier ("4 active"). */
  subtitle?: string;
  /** Filters, period controls, and the primary action, in that reading order. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The one header shape for a collection page — Projects, Clients, Tasks.
 * A `PaneHeader`: it floats over the pane's scroll region, and the rows fade
 * out beneath it. Everything variable goes in `children` so a page can carry a
 * period control, three filter selects, or nothing at all without inventing
 * its own frame for them.
 */
export function CollectionHeader({
  title,
  subtitle,
  children,
  className,
}: CollectionHeaderProps) {
  return (
    <PaneHeader className={className}>
      <PaneTitle subtitle={subtitle}>{title}</PaneTitle>
      {children && <PaneActions>{children}</PaneActions>}
    </PaneHeader>
  );
}
