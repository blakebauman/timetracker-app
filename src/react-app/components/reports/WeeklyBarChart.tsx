import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDurationShort } from "@/lib/dateUtils";
import type { WeeklyData } from "@/hooks/useReports";

interface WeeklyBarChartProps {
  data: WeeklyData[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; fill: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 shadow text-sm">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span>{formatDurationShort(p.value * 3600)}</span>
        </div>
      ))}
    </div>
  );
}

export function WeeklyBarChart({ data }: WeeklyBarChartProps) {
  if (!data.length) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Weekly breakdown</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-16">
          <p className="text-sm text-muted-foreground">No data for this period</p>
        </CardContent>
      </Card>
    );
  }

  // If single week: show Mon-Sun bars with billable overlay
  const isSingleWeek = data.length === 1;

  if (isSingleWeek) {
    const week = data[0];
    const dayMap = new Map(
      week.days.map((d) => [
        DAY_NAMES[new Date(d.date + "T12:00:00").getDay()],
        d,
      ])
    );
    const chartData = DAY_NAMES.map((name) => {
      const d = dayMap.get(name);
      return {
        day: name,
        Total: d ? parseFloat((d.totalSeconds / 3600).toFixed(2)) : 0,
        Billable: d ? parseFloat((d.billableSeconds / 3600).toFixed(2)) : 0,
      };
    });

    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Weekly breakdown — {week.week}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="day"
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
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Total" fill="var(--primary)" opacity={1} radius={[3, 3, 0, 0]} maxBarSize={40} />
              <Bar dataKey="Billable" fill="#10b981" opacity={0.5} radius={[3, 3, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  // Multi-week: one bar per week showing total hours
  const chartData = data.map((w) => ({
    week: w.week,
    Total: parseFloat(
      (w.days.reduce((s, d) => s + d.totalSeconds, 0) / 3600).toFixed(2)
    ),
    Billable: parseFloat(
      (w.days.reduce((s, d) => s + d.billableSeconds, 0) / 3600).toFixed(2)
    ),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Weekly breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="week"
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
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Total" fill="var(--primary)" opacity={1} radius={[3, 3, 0, 0]} maxBarSize={48} />
            <Bar dataKey="Billable" fill="#10b981" opacity={0.5} radius={[3, 3, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
