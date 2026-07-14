import { useMemo, useState } from "react";
import { ReportHeader, type ExportFormat } from "@/components/reports/ReportHeader";
import { AiSummaryDialog } from "@/components/reports/AiSummaryDialog";
import { SummaryCards } from "@/components/reports/SummaryCards";
import { DailyBarChart } from "@/components/reports/DailyBarChart";
import { CumulativeAreaChart } from "@/components/reports/CumulativeAreaChart";
import { BreakdownCard } from "@/components/reports/BreakdownCard";
import { SummaryTree } from "@/components/reports/SummaryTree";
import { RoundingControl } from "@/components/reports/RoundingControl";
import { SavedReportsMenu } from "@/components/reports/SavedReportsMenu";
import type { ReportConfig } from "@/hooks/useSavedReports";
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
  useReportGrouped,
  type ReportSummary,
  type Rounding,
  type GroupDimension,
  type SubGroupDimension,
} from "@/hooks/useReports";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useUIStore } from "@/stores/uiStore";
import { useUpdateSettings } from "@/hooks/useSettings";
import { getDateRangePresets } from "@/lib/dateUtils";
import { exportToCSV, exportToExcel } from "@/lib/exportUtils";

const { last7days } = getDateRangePresets();

const GROUP_DIMS: {
  value: GroupDimension;
  label: string;
  key: keyof ReportSummary;
}[] = [
  { value: "project", label: "Project", key: "byProject" },
  { value: "client", label: "Client", key: "byClient" },
  { value: "task", label: "Task", key: "byTask" },
  { value: "tag", label: "Tag", key: "byTag" },
];

export function ReportsPage() {
  const [range, setRange] = useState({
    since: last7days.since,
    until: last7days.until,
    label: last7days.label,
  });
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [groupDim, setGroupDim] = useState<GroupDimension>("project");
  const [subGroupDim, setSubGroupDim] = useState<SubGroupDimension>("none");

  // Rounding is a persisted per-user preference (hydrated into the UI store).
  const roundMode = useUIStore((s) => s.roundMode);
  const roundMinutes = useUIStore((s) => s.roundMinutes);
  const setRoundingStore = useUIStore((s) => s.setRounding);
  const updateSettings = useUpdateSettings();
  const rounding: Rounding = { mode: roundMode, minutes: roundMinutes };
  const setRounding = (r: Rounding) => {
    setRoundingStore(r.mode, r.minutes); // optimistic; persisted below
    updateSettings.mutate({ roundMode: r.mode, roundMinutes: r.minutes });
  };

  // Debounce the free-text search so typing doesn't refetch on every keystroke.
  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const queryFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch]
  );

  const { data: summary, isLoading } = useReportSummary(
    range.since,
    range.until,
    queryFilters,
    rounding
  );
  const { data: detailed = [], isLoading: detailedLoading } = useReportDetailed(
    range.since,
    range.until,
    queryFilters,
    rounding
  );
  const { data: weekly = [], isLoading: weeklyLoading } = useReportWeekly(
    range.since,
    range.until,
    queryFilters,
    rounding
  );
  const subGrouped = subGroupDim !== "none";
  const { data: grouped } = useReportGrouped(
    range.since,
    range.until,
    groupDim,
    subGroupDim,
    queryFilters,
    rounding,
    subGrouped
  );

  const handleExport = (format: ExportFormat) => {
    const entries = detailed as DetailedEntry[];
    const name = `time-entries-${range.label.replace(/\s/g, "-")}`;
    if (format === "csv") exportToCSV(entries, name);
    else if (format === "excel") exportToExcel(entries, name);
    else window.print();
  };

  const currentConfig: ReportConfig = {
    range,
    filters,
    rounding,
    group: groupDim,
    subGroup: subGroupDim,
  };

  const loadConfig = (cfg: ReportConfig) => {
    if (cfg.range?.since) setRange(cfg.range);
    if (cfg.filters) setFilters({ ...EMPTY_FILTERS, ...cfg.filters });
    if (cfg.rounding) setRounding(cfg.rounding);
    if (cfg.group) setGroupDim(cfg.group);
    if (cfg.subGroup) setSubGroupDim(cfg.subGroup);
  };

  // Group-by + sub-group-by controls, shared by the breakdown and tree views.
  const groupControls = (
    <div className="flex items-center gap-1.5">
      <Select
        value={groupDim}
        onValueChange={(v) => {
          const dim = v as GroupDimension;
          setGroupDim(dim);
          if (subGroupDim === dim) setSubGroupDim("none");
        }}
      >
        <SelectTrigger className="h-7 w-24 text-xs">
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
      <span className="text-xs text-muted-foreground">›</span>
      <Select
        value={subGroupDim}
        onValueChange={(v) => setSubGroupDim(v as SubGroupDimension)}
      >
        <SelectTrigger className="h-7 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No sub-group</SelectItem>
          {GROUP_DIMS.filter((d) => d.value !== groupDim).map((d) => (
            <SelectItem key={d.value} value={d.value}>
              {d.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6 p-6">
      <ReportHeader
        range={range}
        onRangeChange={setRange}
        onExport={handleExport}
        actions={<AiSummaryDialog since={range.since} until={range.until} />}
      />

      <div className="flex flex-wrap items-start justify-between gap-2 print:hidden">
        <ReportFilterBar filters={filters} onChange={setFilters} />
        <div className="flex items-center gap-2">
          <RoundingControl value={rounding} onChange={setRounding} />
          <SavedReportsMenu current={currentConfig} onLoad={loadConfig} />
        </div>
      </div>

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
            <TabsList className="print:hidden">
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
                {subGrouped && grouped ? (
                  <SummaryTree data={grouped} showAmount header={groupControls} />
                ) : (
                  <BreakdownCard
                    title="Breakdown"
                    rows={
                      summary[
                        GROUP_DIMS.find((d) => d.value === groupDim)!.key
                      ] as ReportSummary["byProject"]
                    }
                    totalSeconds={summary.totalSeconds}
                    showAmount
                    header={groupControls}
                  />
                )}
              </div>
              <CumulativeAreaChart data={summary.daily} />
            </TabsContent>

            <TabsContent value="weekly" className="mt-4">
              {weeklyLoading ? (
                <Skeleton className="h-72" />
              ) : (
                <WeeklyBarChart data={weekly} />
              )}
            </TabsContent>

            <TabsContent value="detailed" className="mt-4">
              {detailedLoading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : (
                <DetailedTable entries={detailed as DetailedEntry[]} />
              )}
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
