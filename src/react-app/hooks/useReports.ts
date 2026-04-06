import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface DailyData {
  date: string;
  totalSeconds: number;
  entryCount: number;
}

interface ProjectData {
  projectId: string | null;
  projectName: string;
  projectColor: string;
  entryCount: number;
  totalSeconds: number;
}

export interface ReportSummary {
  totalSeconds: number;
  billableSeconds: number;
  entryCount: number;
  byProject: ProjectData[];
  daily: DailyData[];
}

export function useReportSummary(since: string, until: string) {
  return useQuery({
    queryKey: ["reports", "summary", since, until],
    queryFn: () =>
      api.reports.summary({ since, until, groupBy: "day" }) as Promise<ReportSummary>,
    enabled: Boolean(since && until),
  });
}

export function useReportDetailed(since: string, until: string) {
  return useQuery({
    queryKey: ["reports", "detailed", since, until],
    queryFn: () => api.reports.detailed({ since, until }),
    enabled: Boolean(since && until),
  });
}
