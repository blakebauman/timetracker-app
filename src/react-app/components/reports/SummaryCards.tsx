import { Clock, DollarSign, Hash, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDurationHuman } from "@/lib/dateUtils";

interface SummaryCardsProps {
  totalSeconds: number;
  billableSeconds: number;
  entryCount: number;
  avgSeconds: number;
}

interface Tile {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Tailwind classes for the icon chip background + icon foreground. */
  accent: string;
  extra?: React.ReactNode;
}

export function SummaryCards({
  totalSeconds,
  billableSeconds,
  entryCount,
  avgSeconds,
}: SummaryCardsProps) {
  const billablePercent = totalSeconds
    ? Math.round((billableSeconds / totalSeconds) * 100)
    : 0;

  const tiles: Tile[] = [
    {
      icon: Clock,
      label: "Total tracked",
      value: formatDurationHuman(totalSeconds),
      accent: "bg-primary/10 text-primary",
    },
    {
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
      icon: Hash,
      label: "Entries",
      value: String(entryCount),
      accent: "bg-chart-2/10 text-chart-2",
    },
    {
      icon: TrendingUp,
      label: "Avg / day",
      value: formatDurationHuman(avgSeconds),
      accent: "bg-warning/10 text-warning",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map(({ icon: Icon, label, value, accent, extra }) => (
        <Card key={label}>
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
  );
}
