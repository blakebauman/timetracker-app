import {
  Clock,
  DollarSign,
  Hash,
  TrendingUp,
  Wallet,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDurationShort } from "@/lib/dateUtils";
import { formatCurrency } from "@/lib/currency";
import { useUIStore } from "@/stores/uiStore";
import {
  ALL_METRICS,
  type MetricKey,
} from "@/hooks/useSummaryMetrics";

interface SummaryCardsProps {
  totalSeconds: number;
  billableSeconds: number;
  billableAmount: number;
  entryCount: number;
  avgSeconds: number;
  visible: Record<MetricKey, boolean>;
}

interface Tile {
  key: MetricKey;
  icon: LucideIcon;
  label: string;
  value: string;
  extra?: React.ReactNode;
}

export function SummaryMetricsMenu({
  visible,
  toggle,
}: {
  visible: Record<MetricKey, boolean>;
  toggle: (key: MetricKey) => void;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="Choose metrics"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Choose metrics</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Summary metrics</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ALL_METRICS.map((m) => (
          <DropdownMenuCheckboxItem
            key={m.key}
            checked={visible[m.key]}
            onCheckedChange={() => toggle(m.key)}
            onSelect={(e) => e.preventDefault()}
          >
            {m.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SummaryCards({
  totalSeconds,
  billableSeconds,
  billableAmount,
  entryCount,
  avgSeconds,
  visible,
}: SummaryCardsProps) {
  const currency = useUIStore((s) => s.currency);

  const billablePercent = totalSeconds
    ? Math.round((billableSeconds / totalSeconds) * 100)
    : 0;

  const tiles: Tile[] = [
    {
      key: "total",
      icon: Clock,
      label: "Total tracked",
      value: formatDurationShort(totalSeconds),
    },
    {
      key: "billable",
      icon: DollarSign,
      label: "Billable",
      value: formatDurationShort(billableSeconds),
      extra: (
        // `flex-1` gave the bar zero width once the tile became a single row on
        // mobile, so the percentage survived and the bar it explains vanished.
        // A floor keeps it a bar in both layouts.
        <div className="mt-2 flex items-center gap-2 sm:mt-2">
          <Progress
            value={billablePercent}
            className="h-1.5 w-16 flex-1 bg-success/15 sm:w-auto [&>div]:bg-success"
            aria-hidden
          />
          <span className="text-xs tabular-nums text-muted-foreground">
            {billablePercent}%
          </span>
        </div>
      ),
    },
    {
      key: "amount",
      icon: Wallet,
      label: "Billable amount",
      value: formatCurrency(billableAmount, currency),
    },
    {
      key: "entries",
      icon: Hash,
      label: "Entries",
      value: entryCount.toLocaleString(),
    },
    {
      key: "avg",
      icon: TrendingUp,
      label: "Avg / day",
      value: formatDurationShort(avgSeconds),
    },
  ];

  const shown = tiles.filter((t) => visible[t.key]);

  // One framed strip divided by 1px gaps (bg-border shows through).
  //
  // Below `sm` it is a stacked list, not a grid, and that is the whole point.
  // Wrapping five tiles into two columns has no good answer: `flex-1` on the
  // last row made "Avg / day" — the least important metric — the widest cell on
  // the screen, and a fixed half-basis left a dead grey cell beside it. Both are
  // the shape DESIGN.md's KPI-strip exception exists to avoid, one inverting
  // emphasis and one orphaning a cell. A single column has neither: every metric
  // gets the same row, label left and value right, and it is *shorter* than the
  // two-column reflow was because each row is one line instead of two.
  return (
    <div className="flex animate-fade-up flex-col gap-px overflow-hidden rounded-xl border bg-border sm:flex-row sm:flex-wrap">
      {shown.map(({ key, icon: Icon, label, value, extra }) => (
        <div
          key={key}
          className="flex items-center justify-between gap-3 bg-card px-4 py-2.5 sm:min-w-37.5 sm:flex-1 sm:flex-col sm:items-stretch sm:p-4"
        >
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2 [&>div]:mt-0 sm:mt-1.5 sm:block sm:[&>div]:mt-2">
            {/* `data-slot` follows the convention the ui/ primitives already
                use, and gives this value a hook that does not break every time
                the tile's wrapper changes shape for a breakpoint. */}
            <p
              data-slot="stat-value"
              className="text-xl font-semibold tabular-nums tracking-tight"
            >
              {value}
            </p>
            {extra}
          </div>
        </div>
      ))}
    </div>
  );
}
