import { useState } from "react";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProjectForm } from "@/components/projects/ProjectForm";

/**
 * What a brand-new workspace sees where the entry list would be.
 *
 * The generic "Nothing tracked in this period" empty state is right for a
 * quiet week, but wrong on day one: it points at the timer, and the timer
 * already works. What doesn't work yet is the thing the product is *for* —
 * time attached to a client's project, which is the only kind that becomes an
 * invoice line. Opening the picker on a fresh workspace offered "No project"
 * and nothing else, so the whole value proposition sat behind a door with no
 * handle.
 *
 * Deliberately not a modal, a tour, or a checklist. PRODUCT.md's register is
 * "the tool disappears into the task", and these users arrive fluent in
 * Linear/Toggl — they don't need to be walked through a timer. They need the
 * one door opened, in place, with an honest way past it.
 */
export function FirstProjectPrompt({ onAddEntry }: { onAddEntry?: () => void }) {
  const [formOpen, setFormOpen] = useState(false);

  return (
    <>
      <EmptyState
        icon={FolderPlus}
        title="Start with a project"
        description="Time attached to a project is time you can bill. Group projects under a client and the week becomes an invoice."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" onClick={() => setFormOpen(true)}>
              New project
            </Button>
            {onAddEntry && (
              <Button variant="ghost" size="sm" onClick={onAddEntry}>
                Skip — just log time
              </Button>
            )}
          </div>
        }
        className="py-24"
      />
      {/* Created in place: sending someone to /projects mid-thought is the
          context switch this prompt exists to remove. */}
      <ProjectForm open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
