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
        <div className="mt-2 flex items-center gap-2">
          <Progress
            value={billablePercent}
            className="h-1.5 flex-1 bg-success/15 [&>div]:bg-success"
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

  // One framed strip divided by 1px gaps (bg-border shows through). Flex-wrap
  // with grow so the last row's tiles stretch to fill — no orphaned cell at any
  // width, for any number of visible metrics.
  return (
    <div className="flex animate-fade-up flex-wrap gap-px overflow-hidden rounded-xl border bg-border">
      {shown.map(({ key, icon: Icon, label, value, extra }) => (
        <div key={key} className="min-w-37.5 flex-1 bg-card p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </div>
          <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">
            {value}
          </p>
          {extra}
        </div>
      ))}
    </div>
  );
}
