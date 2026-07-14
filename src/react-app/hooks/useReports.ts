import { useQuery } from "@tanstack/react-query";
import { api, type ReportParams } from "@/lib/api";
import type { ReportFilters } from "@/components/reports/ReportFilterBar";

interface DailyData {
  date: string;
  totalSeconds: number;
  entryCount: number;
}

export interface BreakdownRow {
  id: string | null;
  name: string;
  color?: string;
  entryCount: number;
  totalSeconds: number;
  billableSeconds: number;
  billableAmount: number;
}

export interface ReportSummary {
  totalSeconds: number;
  billableSeconds: number;
  billableAmount: number;
  entryCount: number;
  byProject: BreakdownRow[];
  byClient: BreakdownRow[];
  byTask: BreakdownRow[];
  byTag: BreakdownRow[];
  daily: DailyData[];
}

// Turn the filter arrays into comma-joined query params (undefined when empty)
// plus a stable key fragment so TanStack Query caches per filter combination.
function filterParams(filters?: ReportFilters): {
  params: Omit<ReportParams, "since" | "until">;
  key: string;
} {
  const join = (a?: string[]) => (a && a.length ? a.join(",") : undefined);
  const params = {
    clientIds: join(filters?.clientIds),
    projectIds: join(filters?.projectIds),
    taskIds: join(filters?.taskIds),
    tagIds: join(filters?.tagIds),
  };
  return { params, key: JSON.stringify(params) };
}

export function useReportSummary(
  since: string,
  until: string,
  filters?: ReportFilters
) {
  const { params, key } = filterParams(filters);
  return useQuery({
    queryKey: ["reports", "summary", since, until, key],
    queryFn: () =>
      api.reports.summary({
        since,
        until,
        groupBy: "day",
        ...params,
      }) as Promise<ReportSummary>,
    enabled: Boolean(since && until),
  });
}

export function useReportDetailed(
  since: string,
  until: string,
  filters?: ReportFilters
) {
  const { params, key } = filterParams(filters);
  return useQuery({
    queryKey: ["reports", "detailed", since, until, key],
    queryFn: () => api.reports.detailed({ since, until, ...params }),
    enabled: Boolean(since && until),
  });
}

export interface WeeklyDay {
  date: string;
  totalSeconds: number;
  billableSeconds: number;
  entryCount: number;
}

export interface WeeklyData {
  week: string;
  days: WeeklyDay[];
}

export function useReportWeekly(
  since: string,
  until: string,
  filters?: ReportFilters
) {
  const { params, key } = filterParams(filters);
  return useQuery({
    queryKey: ["reports", "weekly", since, until, key],
    queryFn: () =>
      api.reports.weekly({ since, until, ...params }) as Promise<WeeklyData[]>,
    enabled: Boolean(since && until),
  });
}
