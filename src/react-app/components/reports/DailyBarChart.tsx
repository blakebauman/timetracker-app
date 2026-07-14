import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDurationShort, formatPlainDate } from "@/lib/dateUtils";

interface DailyData {
  date: string;
  totalSeconds: number;
  entryCount: number;
}

interface DailyBarChartProps {
  data: DailyData[];
}

const chartConfig = {
  hours: { label: "Hours", color: "var(--primary)" },
} satisfies ChartConfig;

function formatXLabel(dateStr: string, useDayOfWeek: boolean): string {
  return formatPlainDate(dateStr, useDayOfWeek ? "EEE" : "d MMM");
}

export function DailyBarChart({ data }: DailyBarChartProps) {
  const useDayOfWeek = data.length > 14;

  const chartData = data.map((d) => ({
    ...d,
    hours: parseFloat((d.totalSeconds / 3600).toFixed(2)),
    label: formatXLabel(d.date, useDayOfWeek),
  }));

  const avgHours =
    chartData.length > 0
      ? parseFloat(
          (chartData.reduce((s, d) => s + d.hours, 0) / chartData.length).toFixed(2)
        )
      : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Daily breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-55 w-full">
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
                  labelFormatter={(_, payload) =>
                    payload?.[0]
                      ? formatPlainDate((payload[0].payload as DailyData).date)
                      : ""
                  }
                  formatter={(_value, _name, item) => {
                    const d = item.payload as DailyData;
                    return (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground">
                          {formatDurationShort(d.totalSeconds)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {d.entryCount} entries
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            {avgHours > 0 && (
              <ReferenceLine
                y={avgHours}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 3"
                strokeOpacity={0.6}
              />
            )}
            <Bar
              dataKey="hours"
              fill="var(--color-hours)"
              radius={[3, 3, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
