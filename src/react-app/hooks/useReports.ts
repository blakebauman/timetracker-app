import { useQuery } from "@tanstack/react-query";
import { api, type ReportParams } from "@/lib/api";
import type { ReportFilters } from "@/components/reports/ReportFilterBar";

interface DailyData {
  date: string;
  totalSeconds: number;
  billableSeconds: number;
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

export type RoundMode = "off" | "nearest" | "up" | "down";

export interface Rounding {
  mode: RoundMode;
  minutes: number;
}

export const DEFAULT_ROUNDING: Rounding = { mode: "off", minutes: 15 };

// Turn the filters + rounding into comma-joined query params (undefined when
// empty) plus a stable key fragment so TanStack Query caches per combination.
function queryParams(
  filters?: ReportFilters,
  rounding?: Rounding
): { params: Omit<ReportParams, "since" | "until">; key: string } {
  const join = (a?: string[]) => (a && a.length ? a.join(",") : undefined);
  const rounded = rounding && rounding.mode !== "off" && rounding.minutes > 0;
  const params = {
    clientIds: join(filters?.clientIds),
    projectIds: join(filters?.projectIds),
    taskIds: join(filters?.taskIds),
    tagIds: join(filters?.tagIds),
    billable:
      filters?.billable && filters.billable !== "all" ? filters.billable : undefined,
    search: filters?.search?.trim() || undefined,
    roundMode: rounded ? rounding!.mode : undefined,
    roundMinutes: rounded ? String(rounding!.minutes) : undefined,
  };
  return { params, key: JSON.stringify(params) };
}

export function useReportSummary(
  since: string,
  until: string,
  filters?: ReportFilters,
  rounding?: Rounding
) {
  const { params, key } = queryParams(filters, rounding);
  return useQuery({
    queryKey: ["reports", "summary", since, until, key],
    queryFn: () =>
      api.reports.summary({ since, until, groupBy: "day", ...params }) as Promise<ReportSummary>,
    enabled: Boolean(since && until),
  });
}

export function useReportDetailed(
  since: string,
  until: string,
  filters?: ReportFilters,
  rounding?: Rounding
) {
  const { params, key } = queryParams(filters, rounding);
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
  filters?: ReportFilters,
  rounding?: Rounding
) {
  const { params, key } = queryParams(filters, rounding);
  return useQuery({
    queryKey: ["reports", "weekly", since, until, key],
    queryFn: () =>
      api.reports.weekly({ since, until, ...params }) as Promise<WeeklyData[]>,
    enabled: Boolean(since && until),
  });
}

export type GroupDimension = "project" | "client" | "task" | "tag";
export type SubGroupDimension = "none" | GroupDimension;

export interface GroupRow {
  id: string | null;
  name: string;
  color: string | null;
  entryCount: number;
  totalSeconds: number;
  billableSeconds: number;
  billableAmount: number;
  subGroups?: GroupRow[];
}

export interface GroupedReport {
  group: GroupDimension;
  subGroup: SubGroupDimension;
  totalSeconds: number;
  billableSeconds: number;
  billableAmount: number;
  entryCount: number;
  groups: GroupRow[];
}

export function useReportGrouped(
  since: string,
  until: string,
  group: GroupDimension,
  subGroup: SubGroupDimension,
  filters?: ReportFilters,
  rounding?: Rounding,
  enabled = true
) {
  const { params, key } = queryParams(filters, rounding);
  return useQuery({
    queryKey: ["reports", "grouped", since, until, group, subGroup, key],
    queryFn: () =>
      api.reports.grouped({ since, until, group, subGroup, ...params }) as Promise<GroupedReport>,
    enabled: Boolean(since && until) && enabled,
  });
}
