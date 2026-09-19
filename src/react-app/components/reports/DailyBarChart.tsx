import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDurationShort, formatPlainDate } from "@/lib/dateUtils";
import { useUIStore, type DailyStack } from "@/stores/uiStore";
import type { DailyProjectData } from "@/hooks/useReports";

interface DailyData {
  date: string;
  totalSeconds: number;
  billableSeconds: number;
  entryCount: number;
}

interface DailyBarChartProps {
  data: DailyData[];
  /** The same days split by project, for the "by project" stack. */
  byProject?: DailyProjectData[];
  /** The queried range, so days with no entries still get a column. */
  since?: string;
  until?: string;
}

/*
 * The daily query is `GROUP BY date(te.start)`, so a day nobody tracked simply
 * isn't a row. Rendering those rows straight onto a categorical axis drew
 * "Last 7 days" as five bars — Aug 28 then Aug 31 — and the eye reads adjacent
 * columns as adjacent days, so a three-day gap looked like a one-day gap. The
 * axis has to carry every day in the range or it misstates the shape of the
 * week.
 */
function fillRange(data: DailyData[], since?: string, until?: string): DailyData[] {
  if (!since || !until) return data;
  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  const start = new Date(since);
  const end = new Date(until);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return data;
  // A long range would draw more columns than pixels; past that the sparse
  // series is the lesser evil and the label switches to weekday anyway.
  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (span < 0 || span > 92) return data;

  const bySeen = new Map(data.map((d) => [d.date, d]));
  const out: DailyData[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last) {
    const k = key(cursor);
    out.push(
      bySeen.get(k) ?? { date: k, totalSeconds: 0, billableSeconds: 0, entryCount: 0 }
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/*
 * Recharts' default ticks divide the domain into equal fractions, which on a
 * 3h 25m maximum produced "3.4h / 2.55h / 1.7h / 0.85h / 0h" — decimal hours,
 * in an app whose every other duration reads "1h 30m". Snap to durations a
 * timesheet actually uses instead, and let the axis label itself with the same
 * formatter as the rest of the app.
 */
const TICK_STEPS_SECONDS = [
  15 * 60, 30 * 60, 3600, 2 * 3600, 4 * 3600, 8 * 3600, 12 * 3600, 24 * 3600,
];

function niceTicks(maxSeconds: number): number[] {
  if (maxSeconds <= 0) return [0];
  const step =
    TICK_STEPS_SECONDS.find((s) => maxSeconds / s <= 4) ??
    TICK_STEPS_SECONDS[TICK_STEPS_SECONDS.length - 1];
  const top = Math.ceil(maxSeconds / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1; v += step) ticks.push(v / 3600);
  return ticks;
}

/*
 * The billable stack: the bar height is the day's total, and the split says
 * how much of it you can invoice. Green means the same thing here that it
 * means on the KPI strip's billable bar.
 */
const BILLABLE_CONFIG = {
  billable: { label: "Billable", color: "var(--success)" },
  nonBillable: { label: "Non-billable", color: "var(--chart-ink-soft)" },
} satisfies ChartConfig;

/*
 * The project stack: every day split by what it was spent on, in the
 * project's own swatch — the same colour the entry rows, the calendar blocks
 * and the breakdown donut use, so a red segment here is the same project it
 * is everywhere else.
 *
 * Past a handful of projects the legend stops being scannable and the stack
 * turns into confetti, so the busiest eight in the range get their own
 * series and everything else folds into one muted "Other" segment.
 */
const MAX_PROJECT_SERIES = 8;
const OTHER_KEY = "other";

interface ProjectSeries {
  key: string;
  label: string;
  color: string;
  ids: Set<string | null>;
}

function buildProjectSeries(rows: DailyProjectData[]): ProjectSeries[] {
  const totals = new Map<string | null, { name: string; color: string; seconds: number }>();
  for (const r of rows) {
    const t = totals.get(r.projectId);
    if (t) t.seconds += r.totalSeconds;
    else totals.set(r.projectId, { name: r.projectName, color: r.color, seconds: r.totalSeconds });
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1].seconds - a[1].seconds);
  const kept = ranked.slice(0, MAX_PROJECT_SERIES);
  const rest = ranked.slice(MAX_PROJECT_SERIES);
  // Keys are positional rather than the project id: a Recharts dataKey doubles
  // as a CSS custom-property name in ChartContainer, and an id can carry
  // characters a property name cannot.
  const series: ProjectSeries[] = kept.map(([id, t], i) => ({
    key: `p${i}`,
    label: t.name,
    color: t.color,
    ids: new Set([id]),
  }));
  if (rest.length > 0) {
    series.push({
      key: OTHER_KEY,
      label: rest.length === 1 ? rest[0][1].name : `Other (${rest.length})`,
      color: "var(--chart-ink-soft)",
      ids: new Set(rest.map(([id]) => id)),
    });
  }
  return series;
}

function formatXLabel(dateStr: string, useDayOfWeek: boolean): string {
  return formatPlainDate(dateStr, useDayOfWeek ? "EEE" : "MMM d");
}

const toHours = (seconds: number) => parseFloat((seconds / 3600).toFixed(2));

const STACK_OPTIONS: { value: DailyStack; label: string }[] = [
  { value: "project", label: "Project" },
  { value: "billable", label: "Billable" },
];

export function DailyBarChart({ data, byProject = [], since, until }: DailyBarChartProps) {
  const stack = useUIStore((s) => s.reportDailyStack);
  const setStack = useUIStore((s) => s.setReportDailyStack);

  const projectSeries = useMemo(() => buildProjectSeries(byProject), [byProject]);

  const hasData = data.some((d) => d.totalSeconds > 0);
  if (!hasData) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daily breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={BarChart3}
            title="No tracked time"
            description="Track time in this range and your days will chart here."
            className="py-12"
          />
        </CardContent>
      </Card>
    );
  }

  const series = fillRange(data, since, until);
  const useDayOfWeek = series.length > 14;

  // Per-day project seconds, keyed by series. Built once for the range rather
  // than per bar, so a 92-day range does not walk the rows 92 times.
  const projectByDay = new Map<string, Map<string, number>>();
  if (stack === "project") {
    const keyOf = new Map<string | null, string>();
    for (const s of projectSeries) for (const id of s.ids) keyOf.set(id, s.key);
    for (const r of byProject) {
      const k = keyOf.get(r.projectId);
      if (!k) continue;
      let day = projectByDay.get(r.date);
      if (!day) {
        day = new Map();
        projectByDay.set(r.date, day);
      }
      day.set(k, (day.get(k) ?? 0) + r.totalSeconds);
    }
  }

  const chartData = series.map((d) => {
    const row: Record<string, number | string> & DailyData = {
      ...d,
      hours: toHours(d.totalSeconds),
      label: formatXLabel(d.date, useDayOfWeek),
    };
    if (stack === "billable") {
      row.billable = toHours(d.billableSeconds);
      // Derived rather than queried: the stack has to sum to the day's total,
      // and clamping guards against rounding pushing billable past it.
      row.nonBillable = toHours(Math.max(0, d.totalSeconds - d.billableSeconds));
    } else {
      const day = projectByDay.get(d.date);
      for (const s of projectSeries) row[s.key] = toHours(day?.get(s.key) ?? 0);
    }
    return row;
  });

  const avgHours =
    chartData.length > 0
      ? parseFloat(
          (chartData.reduce((s, d) => s + (d.hours as number), 0) / chartData.length).toFixed(2)
        )
      : 0;

  const ticks = niceTicks(Math.max(...chartData.map((d) => d.hours as number), 0) * 3600);

  const chartConfig: ChartConfig =
    stack === "billable"
      ? BILLABLE_CONFIG
      : Object.fromEntries(projectSeries.map((s) => [s.key, { label: s.label, color: s.color }]));

  const stackKeys = stack === "billable" ? ["billable", "nonBillable"] : projectSeries.map((s) => s.key);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <CardTitle className="text-base">Daily breakdown</CardTitle>
            {/* The dashed rule was a quantity with no name — in no legend and
                with no caption. Captioned here rather than labelled in-plot,
                where the text landed on top of the bars it was drawn over. */}
            {avgHours > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <svg width="14" height="2" aria-hidden className="shrink-0">
                  <line
                    x1="0"
                    y1="1"
                    x2="14"
                    y2="1"
                    stroke="currentColor"
                    strokeDasharray="4 3"
                    strokeOpacity={0.6}
                  />
                </svg>
                avg {formatDurationShort(Math.round(avgHours * 3600))}/day
              </span>
            )}
          </div>
          {/* What a day is split by. A persisted preference: a consultant who
              reads this chart by project reads it that way every week. */}
          <SegmentedControl
            label="Stack each day by"
            options={STACK_OPTIONS}
            value={stack}
            onChange={setStack}
            className="print:hidden"
          />
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-55 w-full">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              ticks={ticks}
              domain={[0, ticks[ticks.length - 1] ?? 0]}
              tickFormatter={(v: number) =>
                v <= 0 ? "0" : formatDurationShort(Math.round(v * 3600))
              }
            />
            <ChartTooltip
              cursor={{ fill: "var(--accent)" }}
              content={({ active, payload, label }) => {
                // A day usually touches two or three projects, not eight; the
                // untouched series would otherwise list as "0m" rows.
                const visible = (payload ?? []).filter((p) => Number(p.value) > 0);
                return (
                  <ChartTooltipContent
                    active={active}
                    payload={visible}
                    label={label}
                    labelFormatter={(_, items) =>
                      items?.[0]
                        ? formatPlainDate((items[0].payload as DailyData).date)
                        : ""
                    }
                    formatter={(value, name, item, index) => {
                      const d = item.payload as DailyData;
                      const cfg = chartConfig[String(name)];
                      return (
                        <div className="flex w-full flex-col gap-0.5">
                          <div className="flex w-full items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                              style={{ background: `var(--color-${String(name)})` }}
                            />
                            <span className="text-muted-foreground">
                              {cfg?.label ?? String(name)}
                            </span>
                            <span className="ml-auto pl-3 font-mono font-medium tabular-nums text-foreground">
                              {formatDurationShort(Number(value) * 3600)}
                            </span>
                          </div>
                          {/* Only under the last segment, so the day's total
                              and entry count appear once rather than per
                              series. */}
                          {index === visible.length - 1 && (
                            <span className="mt-1 border-t pt-1 text-xs text-muted-foreground">
                              {formatDurationShort(d.totalSeconds)} · {d.entryCount}{" "}
                              {d.entryCount === 1 ? "entry" : "entries"}
                            </span>
                          )}
                        </div>
                      );
                    }}
                  />
                );
              }}
            />
            {avgHours > 0 && (
              /* An unlabelled dashed rule is a quantity the reader has to
                 guess at; it was in no legend and had no caption. */
              <ReferenceLine
                y={avgHours}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 3"
                strokeOpacity={0.6}
              />
            )}
            {/* Not optional in either mode: the billable pair sits at 2.23:1
                greyscale in light, and the project swatches carry no meaning
                without their names. */}
            <ChartLegend content={<ChartLegendContent />} />

            {/* Bottom of the stack first: billable at the baseline (the part
                the day is measured on), or the busiest project. */}
            {stackKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="hours"
                fill={`var(--color-${key})`}
                radius={i === stackKeys.length - 1 ? [3, 3, 0, 0] : undefined}
                maxBarSize={40}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
