import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDurationShort, formatPlainDate } from "@/lib/dateUtils";

interface DailyData {
  date: string;
  totalSeconds: number;
  entryCount: number;
}

interface DailyBarChartProps {
  data: DailyData[];
}

function formatXLabel(dateStr: string, useDayOfWeek: boolean): string {
  return formatPlainDate(dateStr, useDayOfWeek ? "EEE" : "d MMM");
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { value: number; payload: DailyData }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 shadow text-sm">
      <p className="font-medium">{formatPlainDate(d.date)}</p>
      <p className="text-muted-foreground">{formatDurationShort(d.totalSeconds)}</p>
      <p className="text-xs text-muted-foreground">{d.entryCount} entries</p>
    </div>
  );
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
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}h`}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--accent)" }} />
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
              fill="var(--primary)"
              radius={[3, 3, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
