import { useState } from "react";
import { Check, ChevronDown, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useProjects } from "@/hooks/useProjects";

interface ProjectPickerProps {
  value: string | null;
  onChange: (projectId: string | null) => void;
  compact?: boolean;
  className?: string;
}

export function ProjectPicker({
  value,
  onChange,
  compact = false,
  className,
}: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: projects = [] } = useProjects();

  const selected = projects.find((p) => p.id === value);
  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "sm" : "default"}
          className={cn(
            "gap-1.5 text-sm",
            !selected && "text-muted-foreground",
            compact && "h-7 px-2",
            className
          )}
        >
          {selected ? (
            <>
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: selected.color }}
              />
              <span className="max-w-[120px] truncate">{selected.name}</span>
            </>
          ) : (
            <>
              <FolderOpen className="h-3.5 w-3.5" />
              {!compact && <span>No project</span>}
            </>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="p-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="h-8 text-sm"
            autoFocus
          />
        </div>
        <div className="max-h-60 overflow-y-auto pb-1">
          {/* No project option */}
          <button
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent",
              !value && "font-medium"
            )}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">No project</span>
            {!value && <Check className="ml-auto h-3.5 w-3.5" />}
          </button>

          {filtered.length > 0 && (
            <div className="my-1 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Projects
            </div>
          )}

          {filtered.map((project) => (
            <button
              key={project.id}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent",
                value === project.id && "font-medium"
              )}
              onClick={() => {
                onChange(project.id);
                setOpen(false);
              }}
            >
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              <span className="truncate">{project.name}</span>
              {value === project.id && (
                <Check className="ml-auto h-3.5 w-3.5 flex-shrink-0" />
              )}
            </button>
          ))}

          {filtered.length === 0 && search && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No projects found
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
