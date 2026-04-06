import { Clock, DollarSign, Hash, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDurationHuman } from "@/lib/dateUtils";

interface SummaryCardsProps {
  totalSeconds: number;
  billableSeconds: number;
  entryCount: number;
  topProject?: { projectName: string; totalSeconds: number } | null;
}

export function SummaryCards({
  totalSeconds,
  billableSeconds,
  entryCount,
  topProject,
}: SummaryCardsProps) {
  const billablePercent = totalSeconds
    ? Math.round((billableSeconds / totalSeconds) * 100)
    : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="flex items-center gap-3 pt-4">
          <div className="rounded-md bg-primary/10 p-2">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total tracked</p>
            <p className="text-lg font-semibold">
              {formatDurationHuman(totalSeconds)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-3 pt-4">
          <div className="rounded-md bg-green-500/10 p-2">
            <DollarSign className="h-4 w-4 text-green-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Billable</p>
            <p className="text-lg font-semibold">
              {formatDurationHuman(billableSeconds)}
            </p>
            <p className="text-xs text-muted-foreground">{billablePercent}%</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-3 pt-4">
          <div className="rounded-md bg-blue-500/10 p-2">
            <Hash className="h-4 w-4 text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Entries</p>
            <p className="text-lg font-semibold">{entryCount}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-3 pt-4">
          <div className="rounded-md bg-purple-500/10 p-2">
            <TrendingUp className="h-4 w-4 text-purple-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Top project</p>
            <p className="text-sm font-semibold truncate">
              {topProject?.projectName ?? "—"}
            </p>
            {topProject && (
              <p className="text-xs text-muted-foreground">
                {formatDurationHuman(topProject.totalSeconds)}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
