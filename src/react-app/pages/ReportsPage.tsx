import { useState } from "react";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { SummaryCards } from "@/components/reports/SummaryCards";
import { DailyBarChart } from "@/components/reports/DailyBarChart";
import { ProjectBreakdown } from "@/components/reports/ProjectBreakdown";
import { WeeklyBarChart } from "@/components/reports/WeeklyBarChart";
import { DetailedTable, type DetailedEntry } from "@/components/reports/DetailedTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useReportSummary, useReportDetailed, useReportWeekly } from "@/hooks/useReports";
import { getDateRangePresets } from "@/lib/dateUtils";
import { exportToCSV } from "@/lib/exportUtils";

const { last7days } = getDateRangePresets();

export function ReportsPage() {
  const [range, setRange] = useState({
    since: last7days.since,
    until: last7days.until,
    label: last7days.label,
  });

  const { data: summary, isLoading } = useReportSummary(range.since, range.until);
  const { data: detailed = [] } = useReportDetailed(range.since, range.until);
  const { data: weekly = [] } = useReportWeekly(range.since, range.until);

  const handleExport = () => {
    exportToCSV(
      detailed as DetailedEntry[],
      `time-entries-${range.label.replace(/\s/g, "-")}`
    );
  };

  return (
    <div className="space-y-6 p-6">
      <ReportHeader range={range} onRangeChange={setRange} onExport={handleExport} />

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
            entryCount={summary.entryCount}
            topProject={summary.byProject[0] ?? null}
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
                <ProjectBreakdown
                  data={summary.byProject}
                  totalSeconds={summary.totalSeconds}
                />
              </div>
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
        <div className="py-16 text-center text-sm text-muted-foreground">
          No data for this period
        </div>
      )}
    </div>
  );
}
