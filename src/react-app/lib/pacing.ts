import type { ProjectPacing } from "@shared/schemas";
import { formatDurationShort } from "@/lib/dateUtils";

/**
 * The one-line pacing verdict shown under a project.
 *
 * Deliberately short and specific: "on pace to overrun by 14h · 12 working days
 * left" is actionable in a way that "92%" is not — the percentage says where you
 * are, the sentence says where you're going and how long you have to change it.
 * Returns null when there is nothing honest to say (no budget, or a budgeted
 * project with no recent activity to extrapolate from).
 */
export function pacingLabel(p: ProjectPacing): string | null {
  if (p.status === "no_budget") return null;

  const daysLeft =
    p.workingDaysRemaining !== null && p.workingDaysRemaining > 0
      ? `${p.workingDaysRemaining} working ${p.workingDaysRemaining === 1 ? "day" : "days"} left`
      : null;

  if (p.status === "over_budget") {
    const over = p.estimatedSeconds ? p.trackedSeconds - p.estimatedSeconds : 0;
    return over > 0 ? `${formatDurationShort(over)} over budget` : "at budget";
  }

  if (p.projectedOverrunSeconds !== null && p.projectedOverrunSeconds > 0) {
    const by = `on pace to overrun by ${formatDurationShort(p.projectedOverrunSeconds)}`;
    return daysLeft ? `${by} · ${daysLeft}` : by;
  }

  if (p.status === "at_risk") {
    return daysLeft ? `close to budget · ${daysLeft}` : "close to budget";
  }

  // On track. Past the halfway mark the remaining budget is the useful number;
  // before that the bar already says it and a sentence would be noise.
  if (p.estimatedSeconds && p.percentUsed !== null && p.percentUsed >= 0.5) {
    const left = p.estimatedSeconds - p.trackedSeconds;
    const remaining = `${formatDurationShort(left)} left`;
    return daysLeft ? `${remaining} · ${daysLeft}` : remaining;
  }
  return null;
}

/**
 * Tailwind text token for a pacing status.
 *
 * `warning-ink`, not `warning`: --warning is calibrated as a *fill* and fails AA
 * as small type on card (3.15:1). The bar can use --warning; this label can't.
 * See the token comments in index.css.
 */
export function pacingToneClass(status: ProjectPacing["status"]): string {
  switch (status) {
    case "over_budget":
      return "text-destructive";
    case "at_risk":
      return "text-warning-ink";
    default:
      return "text-muted-foreground";
  }
}
