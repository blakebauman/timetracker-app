import { useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Spinner } from "@/components/ui/spinner";
import { useAssistantMemory, useDeleteAssistantMemory } from "@/hooks/useAssistant";

/**
 * Settings card that surfaces the durable facts the assistant has remembered
 * about the user (via its rememberPreference tool) so they can be reviewed and
 * removed.
 */
export function AssistantMemoryCard() {
  const { data: memories = [], isLoading } = useAssistantMemory();
  const del = useDeleteAssistantMemory();
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Assistant memory
        </CardTitle>
        {memories.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setConfirmClear(true)}
            disabled={del.isPending}
          >
            Forget all
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Facts the assistant keeps between conversations to personalize its help — like
          billing defaults or how you like to work. Remove anything it shouldn't hold onto.
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Loading…
          </div>
        ) : memories.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            The assistant hasn't remembered anything yet. Tell it a preference in chat (e.g.
            “always mark Acme non-billable”) and it'll show up here.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {memories.map((m) => (
              <li key={m.key} className="flex items-start gap-2 p-3">
                <span className="min-w-0 flex-1 text-sm">{m.content}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 text-muted-foreground"
                  onClick={() => del.mutate(m.key)}
                  disabled={del.isPending}
                  aria-label="Forget this"
                  title="Forget this"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Forget everything?"
        description="The assistant will lose all remembered facts about you. This can't be undone."
        confirmLabel="Forget all"
        onConfirm={() => {
          del.mutate(null);
          setConfirmClear(false);
        }}
      />
    </Card>
  );
}
