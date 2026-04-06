import { useState } from "react";
import { Check, ChevronDown, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTasks } from "@/hooks/useTasks";

interface TaskPickerProps {
  projectId: string | null;
  value: string | null;
  onChange: (taskId: string | null) => void;
  compact?: boolean;
  className?: string;
}

export function TaskPicker({
  projectId,
  value,
  onChange,
  compact = false,
  className,
}: TaskPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: tasks = [] } = useTasks(projectId ?? undefined);

  const selected = tasks.find((t) => t.id === value);
  const filtered = tasks.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  // No project selected = no tasks possible
  if (!projectId) return null;

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
          <CheckSquare className="h-3.5 w-3.5 shrink-0" />
          {selected ? (
            <span className="max-w-[120px] truncate">{selected.name}</span>
          ) : (
            !compact && <span>No task</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="p-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="h-8 text-sm"
            autoFocus
          />
        </div>
        <div className="max-h-52 overflow-y-auto pb-1">
          <button
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent",
              !value && "font-medium"
            )}
            onClick={() => { onChange(null); setOpen(false); }}
          >
            <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">No task</span>
            {!value && <Check className="ml-auto h-3.5 w-3.5" />}
          </button>

          {filtered.length > 0 && (
            <div className="my-1 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Tasks
            </div>
          )}

          {filtered.map((task) => (
            <button
              key={task.id}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent",
                value === task.id && "font-medium"
              )}
              onClick={() => { onChange(task.id); setOpen(false); }}
            >
              <CheckSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{task.name}</span>
              {value === task.id && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}

          {filtered.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {tasks.length === 0 ? "No tasks for this project" : "No tasks found"}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
