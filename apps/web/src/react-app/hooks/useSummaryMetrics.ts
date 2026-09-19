import { useState } from "react";

export type MetricKey = "total" | "billable" | "amount" | "entries" | "avg";

export const ALL_METRICS: { key: MetricKey; label: string }[] = [
  { key: "total", label: "Total tracked" },
  { key: "billable", label: "Billable" },
  { key: "amount", label: "Billable amount" },
  { key: "entries", label: "Entries" },
  { key: "avg", label: "Avg / day" },
];

const STORAGE_KEY = "reports_summary_metrics";

const DEFAULT_VISIBLE: Record<MetricKey, boolean> = {
  total: true,
  billable: true,
  amount: true,
  entries: true,
  avg: true,
};

function loadVisible(): Record<MetricKey, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...DEFAULT_VISIBLE, ...saved };
  } catch {
    return DEFAULT_VISIBLE;
  }
}

/**
 * Which summary metrics the reports strip shows, persisted per browser.
 *
 * Lives outside SummaryCards so the chooser can sit in the reports toolbar with
 * the other view controls; it previously had a row of its own above the strip —
 * one 32px icon button alone in an otherwise empty band.
 */
export function useSummaryMetrics() {
  const [visible, setVisible] = useState<Record<MetricKey, boolean>>(loadVisible);

  const toggle = (key: MetricKey) =>
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });

  return { visible, toggle };
}
