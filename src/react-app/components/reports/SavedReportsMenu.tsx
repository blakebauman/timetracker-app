import { useState } from "react";
import { Bookmark, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useSavedReports,
  useCreateSavedReport,
  useDeleteSavedReport,
  type ReportConfig,
} from "@/hooks/useSavedReports";

interface SavedReportsMenuProps {
  current: ReportConfig;
  onLoad: (config: ReportConfig) => void;
}

export function SavedReportsMenu({ current, onLoad }: SavedReportsMenuProps) {
  const { data: reports = [] } = useSavedReports();
  const create = useCreateSavedReport();
  const remove = useDeleteSavedReport();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate({ name: trimmed, config: current });
    setName("");
    setDialogOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="Saved">
                <Bookmark className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Saved reports</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Saved reports</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {reports.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              No saved reports yet
            </div>
          ) : (
            reports.map((r) => (
              <DropdownMenuItem
                key={r.id}
                onClick={() => onLoad(r.config)}
                className="group flex items-center justify-between gap-2"
              >
                <span className="truncate">{r.name}</span>
                <button
                  type="button"
                  aria-label={`Delete ${r.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove.mutate(r.id);
                  }}
                  className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Save current view…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save report</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="saved-report-name">Name</Label>
            <Input
              id="saved-report-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme — billable, this month"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
