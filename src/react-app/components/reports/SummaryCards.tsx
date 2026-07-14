import { useState } from "react";
import {
  Clock,
  DollarSign,
  Hash,
  TrendingUp,
  Wallet,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatDurationHuman } from "@/lib/dateUtils";
import { formatCurrency } from "@/lib/currency";
import { useUIStore } from "@/stores/uiStore";

interface SummaryCardsProps {
  totalSeconds: number;
  billableSeconds: number;
  billableAmount: number;
  entryCount: number;
  avgSeconds: number;
}

type MetricKey = "total" | "billable" | "amount" | "entries" | "avg";

interface Tile {
  key: MetricKey;
  icon: LucideIcon;
  label: string;
  value: string;
  accent: string;
  extra?: React.ReactNode;
}

const ALL_METRICS: { key: MetricKey; label: string }[] = [
  { key: "total", label: "Total tracked" },
  { key: "billable", label: "Billable" },
  { key: "amount", label: "Billable amount" },
  { key: "entries", label: "Entries" },
  { key: "avg", label: "Avg / day" },
];

const STORAGE_KEY = "reports_summary_metrics";
const DEFAULT_VISIBLE: Record<MetricKey, boolean> = {
  total: true,
  billable: true,
  amount: true,
  entries: true,
  avg: true,
};

function loadVisible(): Record<MetricKey, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...DEFAULT_VISIBLE, ...saved };
  } catch {
    return DEFAULT_VISIBLE;
  }
}

export function SummaryCards({
  totalSeconds,
  billableSeconds,
  billableAmount,
  entryCount,
  avgSeconds,
}: SummaryCardsProps) {
  const currency = useUIStore((s) => s.currency);
  const [visible, setVisible] = useState<Record<MetricKey, boolean>>(loadVisible);

  const toggle = (key: MetricKey) =>
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });

  const billablePercent = totalSeconds
    ? Math.round((billableSeconds / totalSeconds) * 100)
    : 0;

  const tiles: Tile[] = [
    {
      key: "total",
      icon: Clock,
      label: "Total tracked",
      value: formatDurationHuman(totalSeconds),
      accent: "bg-primary/10 text-primary",
    },
    {
      key: "billable",
      icon: DollarSign,
      label: "Billable",
      value: formatDurationHuman(billableSeconds),
      accent: "bg-success/10 text-success",
      extra: (
        <div className="mt-1.5 flex items-center gap-2">
          <Progress
            value={billablePercent}
            className="h-1.5 flex-1 bg-success/20 [&>div]:bg-success"
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
      accent: "bg-success/10 text-success",
    },
    {
      key: "entries",
      icon: Hash,
      label: "Entries",
      value: String(entryCount),
      accent: "bg-chart-2/10 text-chart-2",
    },
    {
      key: "avg",
      icon: TrendingUp,
      label: "Avg / day",
      value: formatDurationHuman(avgSeconds),
      accent: "bg-warning/10 text-warning",
    },
  ];

  const shown = tiles.filter((t) => visible[t.key]);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Metrics
            </Button>
          </DropdownMenuTrigger>
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {shown.map(({ key, icon: Icon, label, value, accent, extra }, i) => (
          <Card
            key={key}
            className="animate-fade-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-md p-2 ${accent}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-semibold">{value}</p>
                  {extra}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
