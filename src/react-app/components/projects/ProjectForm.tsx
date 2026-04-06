import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateProject, useUpdateProject, useClients } from "@/hooks/useProjects";
import { PROJECT_COLORS } from "@/lib/colorUtils";
import { cn } from "@/lib/utils";
import type { Project } from "@shared/schemas";

interface ProjectFormProps {
  project?: Project;
  open: boolean;
  onClose: () => void;
}

export function ProjectForm({ project, open, onClose }: ProjectFormProps) {
  const [name, setName] = useState(project?.name ?? "");
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[9]);
  const [clientId, setClientId] = useState<string>(project?.clientId ?? "none");
  const [billable, setBillable] = useState(project?.billable ?? false);
  const [rate, setRate] = useState<string>(project?.rate?.toString() ?? "");
  const { data: clients = [] } = useClients();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();

  const isPending = createProject.isPending || updateProject.isPending;

  const handleSave = () => {
    const data = {
      name,
      color,
      clientId: clientId === "none" ? null : clientId,
      billable,
      rate: rate ? parseFloat(rate) : null,
    };

    if (project) {
      updateProject.mutate(
        { id: project.id, data },
        { onSuccess: onClose }
      );
    } else {
      createProject.mutate(data, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {project ? "Edit Project" : "New Project"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  className={cn(
                    "h-6 w-6 rounded-full ring-2 ring-offset-2 transition-all",
                    color === c ? "ring-foreground scale-110" : "ring-transparent hover:scale-105"
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="No client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No client</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Switch
                id="billable"
                checked={billable}
                onCheckedChange={setBillable}
              />
              <Label htmlFor="billable">Billable</Label>
            </div>
            {billable && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Rate</span>
                <Input
                  type="number"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="0.00"
                  className="w-24 text-sm"
                  min={0}
                  step={0.01}
                />
                <span className="text-sm text-muted-foreground">/h</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || isPending}
          >
            {project ? "Save changes" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
