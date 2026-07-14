import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
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

interface CumulativeAreaChartProps {
  data: DailyData[];
}

const chartConfig = {
  hours: { label: "Cumulative", color: "var(--primary)" },
} satisfies ChartConfig;

function formatXLabel(dateStr: string, useDayOfWeek: boolean): string {
  return formatPlainDate(dateStr, useDayOfWeek ? "EEE" : "d MMM");
}

export function CumulativeAreaChart({ data }: CumulativeAreaChartProps) {
  const useDayOfWeek = data.length > 14;

  const chartData = data.map((d, i) => {
    const cumulativeSeconds = data
      .slice(0, i + 1)
      .reduce((sum, x) => sum + x.totalSeconds, 0);
    return {
      date: d.date,
      label: formatXLabel(d.date, useDayOfWeek),
      cumulativeSeconds,
      hours: parseFloat((cumulativeSeconds / 3600).toFixed(2)),
    };
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Cumulative hours</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-50 w-full">
          <AreaChart
            accessibilityLayer
            data={chartData}
            margin={{ left: 4, right: 8, top: 4 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={36}
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => `${v}h`}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) =>
                    payload?.[0]
                      ? formatPlainDate((payload[0].payload as (typeof chartData)[number]).date)
                      : ""
                  }
                  formatter={(_value, _name, item) => (
                    <span className="text-muted-foreground">
                      {formatDurationShort(
                        (item.payload as (typeof chartData)[number]).cumulativeSeconds
                      )}{" "}
                      total
                    </span>
                  )}
                />
              }
            />
            <defs>
              <linearGradient id="fillCumulativeHours" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-hours)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-hours)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <Area
              dataKey="hours"
              type="natural"
              fill="url(#fillCumulativeHours)"
              fillOpacity={0.4}
              stroke="var(--color-hours)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
