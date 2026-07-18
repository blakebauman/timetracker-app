import { useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { UIMessage } from "ai";
import { Button } from "@/components/ui/button";

// Hover-revealed actions under an assistant message (fold.run chat/message-actions,
// trimmed to what applies here: copy the reply and regenerate the last turn).
export function MessageActions({
  message,
  canRegenerate,
  onRegenerate,
}: {
  message: UIMessage;
  canRegenerate: boolean;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const text = message.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();

  if (!text) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        onClick={copy}
        aria-label="Copy reply"
        title="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      {canRegenerate && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={onRegenerate}
          aria-label="Regenerate reply"
          title="Regenerate"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
