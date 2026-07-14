import { useState } from "react";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { AiSummaryDialog } from "@/components/reports/AiSummaryDialog";
import { SummaryCards } from "@/components/reports/SummaryCards";
import { DailyBarChart } from "@/components/reports/DailyBarChart";
import { CumulativeAreaChart } from "@/components/reports/CumulativeAreaChart";
import { BreakdownCard } from "@/components/reports/BreakdownCard";
import {
  ReportFilterBar,
  EMPTY_FILTERS,
  type ReportFilters,
} from "@/components/reports/ReportFilterBar";
import { WeeklyBarChart } from "@/components/reports/WeeklyBarChart";
import { DetailedTable, type DetailedEntry } from "@/components/reports/DetailedTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { BarChart2 } from "lucide-react";
import {
  useReportSummary,
  useReportDetailed,
  useReportWeekly,
  type ReportSummary,
} from "@/hooks/useReports";
import { getDateRangePresets } from "@/lib/dateUtils";
import { exportToCSV } from "@/lib/exportUtils";

const { last7days } = getDateRangePresets();

type GroupDim = "project" | "client" | "task" | "tag";

const GROUP_DIMS: { value: GroupDim; label: string; key: keyof ReportSummary }[] = [
  { value: "project", label: "By project", key: "byProject" },
  { value: "client", label: "By client", key: "byClient" },
  { value: "task", label: "By task", key: "byTask" },
  { value: "tag", label: "By tag", key: "byTag" },
];

export function ReportsPage() {
  const [range, setRange] = useState({
    since: last7days.since,
    until: last7days.until,
    label: last7days.label,
  });
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [groupDim, setGroupDim] = useState<GroupDim>("project");

  const { data: summary, isLoading } = useReportSummary(range.since, range.until, filters);
  const { data: detailed = [] } = useReportDetailed(range.since, range.until, filters);
  const { data: weekly = [] } = useReportWeekly(range.since, range.until, filters);

  const handleExport = () => {
    exportToCSV(
      detailed as DetailedEntry[],
      `time-entries-${range.label.replace(/\s/g, "-")}`
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <ReportHeader range={range} onRangeChange={setRange} onExport={handleExport} />
        </div>
        <AiSummaryDialog since={range.since} until={range.until} />
      </div>

      <ReportFilterBar filters={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-60" />
        </div>
      ) : summary ? (
        <>
          <SummaryCards
            totalSeconds={summary.totalSeconds}
            billableSeconds={summary.billableSeconds}
            billableAmount={summary.billableAmount}
            entryCount={summary.entryCount}
            avgSeconds={(() => {
              const sinceMs = range.since ? new Date(range.since).getTime() : NaN;
              const untilMs = range.until ? new Date(range.until).getTime() : NaN;
              const daysInRange =
                isNaN(sinceMs) || isNaN(untilMs)
                  ? 1
                  : Math.max(1, Math.round((untilMs - sinceMs) / 86400000) + 1);
              return summary.totalSeconds / daysInRange;
            })()}
          />

          <Tabs defaultValue="summary">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="detailed">
                Detailed
                {detailed.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {detailed.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="mt-4 space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <DailyBarChart data={summary.daily} />
                <BreakdownCard
                  title="Breakdown"
                  rows={summary[
                    GROUP_DIMS.find((d) => d.value === groupDim)!.key
                  ] as ReportSummary["byProject"]}
                  totalSeconds={summary.totalSeconds}
                  showAmount
                  header={
                    <Select
                      value={groupDim}
                      onValueChange={(v) => setGroupDim(v as GroupDim)}
                    >
                      <SelectTrigger className="h-7 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GROUP_DIMS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
              </div>
              <CumulativeAreaChart data={summary.daily} />
            </TabsContent>

            <TabsContent value="weekly" className="mt-4">
              <WeeklyBarChart data={weekly} />
            </TabsContent>

            <TabsContent value="detailed" className="mt-4">
              <DetailedTable entries={detailed as DetailedEntry[]} />
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <EmptyState
          icon={BarChart2}
          title="No data for this period"
          description="Try a different date range, or start tracking time"
        />
      )}
    </div>
  );
}
