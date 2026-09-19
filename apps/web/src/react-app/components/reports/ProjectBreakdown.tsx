import { PieChart, Pie, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDurationShort } from "@/lib/dateUtils";
import { ColorDot } from "@/components/ColorDot";

interface ProjectData {
  projectId: string | null;
  projectName: string;
  projectColor: string;
  totalSeconds: number;
  entryCount: number;
}

interface ProjectBreakdownProps {
  data: ProjectData[];
  totalSeconds: number;
}

const EMPTY_DONUT = [{ name: "No data", value: 1 }];

const chartConfig = {
  totalSeconds: { label: "Time" },
} satisfies ChartConfig;

export function ProjectBreakdown({ data, totalSeconds }: ProjectBreakdownProps) {
  const sorted = [...data].sort((a, b) => b.totalSeconds - a.totalSeconds);
  const isEmpty = totalSeconds === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">By project</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:flex-row md:items-start">
        {/* Donut chart */}
        <div className="shrink-0">
          <ChartContainer config={chartConfig} className="aspect-square h-40 w-40">
            <PieChart>
              {isEmpty ? (
                <Pie
                  data={EMPTY_DONUT}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={70}
                  dataKey="value"
                  stroke="none"
                >
                  <Cell fill="var(--muted)" />
                </Pie>
              ) : (
                <Pie
                  data={sorted}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={70}
                  dataKey="totalSeconds"
                  nameKey="projectName"
                  stroke="none"
                >
                  {sorted.map((entry, i) => (
                    <Cell key={i} fill={entry.projectColor} />
                  ))}
                </Pie>
              )}
              {!isEmpty && (
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name, item) => (
                        <>
                          <ColorDot color={(item.payload as ProjectData).projectColor} />
                          <span className="text-muted-foreground">{name}</span>
                          <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
                            {formatDurationShort(Number(value))}
                          </span>
                        </>
                      )}
                    />
                  }
                />
              )}
            </PieChart>
          </ChartContainer>
        </div>

        {/* Project table */}
        <div className="flex-1 space-y-1.5">
          {isEmpty ? (
            <div className="flex h-full items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">No tracked time for this period</p>
            </div>
          ) : (
            <>
              {sorted.map((p) => {
                const pct = totalSeconds
                  ? Math.round((p.totalSeconds / totalSeconds) * 100)
                  : 0;
                return (
                  <div key={p.projectId ?? "none"} className="flex items-center gap-2">
                    <ColorDot color={p.projectColor} />
                    <span className="min-w-0 flex-1 shrink-0 truncate text-sm">
                      {p.projectName}
                    </span>
                    <span className="text-xs text-muted-foreground">{pct}%</span>
                    <span className="min-w-12 text-right text-sm font-medium">
                      {formatDurationShort(p.totalSeconds)}
                    </span>
                  </div>
                );
              })}

              {/* Total row */}
              <div className="mt-2 flex items-center gap-2 border-t pt-2">
                <span className="h-2.5 w-2.5 shrink-0" />
                <span className="min-w-0 flex-1 shrink-0 truncate text-sm font-medium">
                  Total
                </span>
                <span className="text-xs text-muted-foreground">100%</span>
                <span className="min-w-12 text-right text-sm font-semibold">
                  {formatDurationShort(totalSeconds)}
                </span>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
