import { useState } from "react";
import { Check, ChevronDown, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
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
  const { data: tasks = [] } = useTasks(projectId ?? undefined);

  const selected = tasks.find((t) => t.id === value);

  const select = (taskId: string | null) => {
    onChange(taskId);
    setOpen(false);
  };

  // No project selected = no tasks possible
  if (!projectId) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "sm" : "default"}
          aria-label={selected ? `Task: ${selected.name}` : "Select task"}
          className={cn(
            "gap-1.5 text-sm",
            !selected && "text-muted-foreground",
            compact && "h-7 px-2",
            className
          )}
        >
          <CheckSquare className="h-3.5 w-3.5 shrink-0" />
          {selected ? (
            <span className="max-w-30 truncate">{selected.name}</span>
          ) : (
            !compact && <span>No task</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search tasks..." className="h-9" />
          <CommandList>
            <CommandEmpty>
              {tasks.length === 0 ? "No tasks for this project" : "No tasks found"}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="no-task"
                keywords={["no task"]}
                onSelect={() => select(null)}
              >
                <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">No task</span>
                {!value && <Check className="ml-auto h-3.5 w-3.5" />}
              </CommandItem>
              {tasks.map((task) => (
                <CommandItem
                  key={task.id}
                  value={task.id}
                  keywords={[task.name]}
                  onSelect={() => select(task.id)}
                >
                  <CheckSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{task.name}</span>
                  {value === task.id && (
                    <Check className="ml-auto h-3.5 w-3.5 shrink-0" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
