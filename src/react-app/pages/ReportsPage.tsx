import { useState } from "react";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { SummaryCards } from "@/components/reports/SummaryCards";
import { DailyBarChart } from "@/components/reports/DailyBarChart";
import { ProjectBreakdown } from "@/components/reports/ProjectBreakdown";
import { Skeleton } from "@/components/ui/skeleton";
import { useReportSummary, useReportDetailed } from "@/hooks/useReports";
import { getDateRangePresets } from "@/lib/dateUtils";
import { exportToCSV } from "@/lib/exportUtils";
import type { TimeEntry } from "@shared/schemas";

const { last7days } = getDateRangePresets();

export function ReportsPage() {
  const [range, setRange] = useState({
    since: last7days.since,
    until: last7days.until,
    label: last7days.label,
  });

  const { data: summary, isLoading } = useReportSummary(range.since, range.until);
  const { data: detailed = [] } = useReportDetailed(range.since, range.until);

  const handleExport = () => {
    exportToCSV(detailed as TimeEntry[], `time-entries-${range.label.replace(/\s/g, "-")}`);
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

          <div className="grid gap-4 lg:grid-cols-2">
            <DailyBarChart data={summary.daily} />
            <ProjectBreakdown
              data={summary.byProject}
              totalSeconds={summary.totalSeconds}
            />
          </div>
        </>
      ) : (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No data for this period
        </div>
      )}
    </div>
  );
}
