import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatSeconds, formatEntryTime } from "@/lib/dateUtils";
import { Search } from "lucide-react";

export interface DetailedEntry {
  id: string;
  description: string;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  clientName: string | null;
  start: string;
  stop: string | null;
  duration: number | null;
  billable: boolean;
  tags: string[];
}

interface DetailedTableProps {
  entries: DetailedEntry[];
}

export function DetailedTable({ entries }: DetailedTableProps) {
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const projects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      if (e.projectId && e.projectName && !seen.has(e.projectId)) {
        seen.set(e.projectId, e.projectName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (projectFilter !== "all" && e.projectId !== projectFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          e.description.toLowerCase().includes(q) ||
          (e.projectName ?? "").toLowerCase().includes(q) ||
          (e.clientName ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [entries, search, projectFilter]);

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No entries for this period
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search entries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-44 text-sm">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Description</th>
              <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">
                Project
              </th>
              <th className="hidden px-3 py-2 text-left font-medium md:table-cell">
                Date
              </th>
              <th className="hidden px-3 py-2 text-left font-medium md:table-cell">
                Time
              </th>
              <th className="px-3 py-2 text-right font-medium">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((entry) => (
              <tr key={entry.id} className="hover:bg-accent/30 transition-colors">
                <td className="px-3 py-2.5">
                  <div className="min-w-0">
                    <span className="block truncate font-medium">
                      {entry.description || (
                        <span className="italic text-muted-foreground">
                          No description
                        </span>
                      )}
                    </span>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {entry.billable && (
                        <span className="text-[10px] font-semibold text-primary">
                          $
                        </span>
                      )}
                      {entry.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="h-4 px-1 py-0 text-[10px] font-normal"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 sm:table-cell">
                  {entry.projectName ? (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            entry.projectColor ?? "#94a3b8",
                        }}
                      />
                      <span className="truncate text-xs">
                        {entry.projectName}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">
                  {entry.start.slice(0, 10)}
                </td>
                <td className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">
                  {formatEntryTime(entry.start)}
                  {entry.stop && <> – {formatEntryTime(entry.stop)}</>}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                  {entry.duration ? formatSeconds(entry.duration) : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No entries match your filters
          </div>
        )}
        <div className="border-t bg-muted/20 px-3 py-2 text-right text-xs text-muted-foreground">
          {filtered.length} entr{filtered.length !== 1 ? "ies" : "y"}
          {filtered.length !== entries.length && ` of ${entries.length}`}
        </div>
      </div>
    </div>
  );
}
