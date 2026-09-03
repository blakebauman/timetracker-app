import { cn } from "@/lib/utils";

interface SpentFigureProps {
  /** What has been used — the live number. */
  spent: string;
  /** What it is measured against — the estimate or budget. */
  of: string;
  className?: string;
}

/**
 * The `5h 30m / 90h` caption beside a progress bar.
 *
 * Three surfaces rendered this pair — project budgets, task estimates in the
 * project drawer, task estimates in the board — and all three set the whole
 * string at Micro *and* muted, the smallest step of the ramp at the lowest
 * contrast on it. Doubling the de-emphasis put the one live number in the row
 * below the chrome around it.
 *
 * The size stays at Micro: the Two-Tier Rule (DESIGN.md §3) fixes it there, and
 * a 12px caption under a 12px metadata line would flatten the row rather than
 * rank it. The hierarchy comes from contrast instead — the spent figure is ink,
 * the thing it is measured against stays muted, because the budget is a
 * constant the reader already knows and the spent value is the news.
 */
export function SpentFigure({ spent, of, className }: SpentFigureProps) {
  return (
    <span className={cn("text-micro tabular-nums", className)}>
      <span className="text-foreground">{spent}</span>
      <span className="text-muted-foreground"> / {of}</span>
    </span>
  );
}
