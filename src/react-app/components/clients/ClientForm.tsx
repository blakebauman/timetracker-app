import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useCreateClient } from "@/hooks/useProjects";

interface ClientFormProps {
  open: boolean;
  onClose: () => void;
}

export function ClientForm({ open, onClose }: ClientFormProps) {
  const [name, setName] = useState("");
  const createClient = useCreateClient();

  const handleSave = () => {
    if (!name.trim()) return;
    createClient.mutate({ name: name.trim() }, { onSuccess: onClose });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Client</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Client name"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || createClient.isPending}>
            Create client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
