import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDurationShort, formatPlainDate } from "@/lib/dateUtils";
import type { WeeklyData, WeeklyDay } from "@/hooks/useReports";

interface WeeklyBarChartProps {
  data: WeeklyData[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const chartConfig = {
  total: { label: "Total", color: "var(--primary)" },
  billable: { label: "Billable", color: "var(--chart-2)" },
} satisfies ChartConfig;

function weekRangeLabel(days: WeeklyDay[]): string {
  if (!days.length) return "";
  const first = formatPlainDate(days[0].date, "MMM d");
  const last = formatPlainDate(days[days.length - 1].date, "MMM d");
  return first === last ? first : `${first} – ${last}`;
}

function toHours(seconds: number): number {
  return parseFloat((seconds / 3600).toFixed(2));
}

export function WeeklyBarChart({ data }: WeeklyBarChartProps) {
  const hasData = data.some((w) => w.days.some((d) => d.totalSeconds > 0));
  if (!hasData) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Weekly breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={BarChart3}
            title="No tracked time"
            description="Track time in this range to see it by weekday."
            className="py-12"
          />
        </CardContent>
      </Card>
    );
  }

  const isSingleWeek = data.length === 1;

  // Single week: one bar group per weekday (Sun–Sat, zero-filled).
  // Multi-week: one bar group per week, labeled by date range.
  let chartData: { label: string; total: number; billable: number }[];
  let title: string;
  let maxBarSize: number;

  if (isSingleWeek) {
    const week = data[0];
    const dayMap = new Map(
      week.days.map((d) => [formatPlainDate(d.date, "EEE"), d])
    );
    chartData = DAY_NAMES.map((name) => {
      const d = dayMap.get(name);
      return {
        label: name,
        total: d ? toHours(d.totalSeconds) : 0,
        billable: d ? toHours(d.billableSeconds) : 0,
      };
    });
    title = `Weekly breakdown — ${weekRangeLabel(week.days)}`;
    maxBarSize = 40;
  } else {
    chartData = data.map((w) => ({
      label: weekRangeLabel(w.days),
      total: toHours(w.days.reduce((s, d) => s + d.totalSeconds, 0)),
      billable: toHours(w.days.reduce((s, d) => s + d.billableSeconds, 0)),
    }));
    title = "Weekly breakdown";
    maxBarSize = 48;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-60 w-full">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}h`}
            />
            <ChartTooltip
              cursor={{ fill: "var(--accent)" }}
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <>
                      <div
                        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                        style={{ background: `var(--color-${name})` }}
                      />
                      <span className="text-muted-foreground">
                        {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                      </span>
                      <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
                        {formatDurationShort(Number(value) * 3600)}
                      </span>
                    </>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="total"
              fill="var(--color-total)"
              radius={[3, 3, 0, 0]}
              maxBarSize={maxBarSize}
            />
            <Bar
              dataKey="billable"
              fill="var(--color-billable)"
              fillOpacity={0.5}
              radius={[3, 3, 0, 0]}
              maxBarSize={maxBarSize}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
