import { useState } from "react";
import { Sparkles, Copy, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { useAiSummary } from "@/hooks/useAi";
import { mutationErrorMessage } from "@/lib/api";

interface AiSummaryDialogProps {
  since: string;
  until: string;
}

export function AiSummaryDialog({ since, until }: AiSummaryDialogProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<"bullets" | "narrative">("bullets");
  const [summary, setSummary] = useState("");
  const [copied, setCopied] = useState(false);
  const aiSummary = useAiSummary();

  const handleGenerate = () => {
    if (aiSummary.isPending) return;
    setCopied(false);
    aiSummary.mutate({ since, until, style }, { onSuccess: (data) => setSummary(data.summary) });
  };
  const hasDrafted = summary.length > 0;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
  };

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setSummary("");
      setCopied(false);
      aiSummary.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="Draft summary">
              <Sparkles className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Draft summary</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Draft summary</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2">
            <Select value={style} onValueChange={(v) => setStyle(v as "bullets" | "narrative")}>
              <SelectTrigger className="w-40" aria-label="Summary style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bullets">Bullet points</SelectItem>
                <SelectItem value="narrative">Narrative</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleGenerate}
              disabled={aiSummary.isPending}
            >
              {aiSummary.isPending && <Spinner size="sm" />}
              {aiSummary.isPending ? "Drafting…" : hasDrafted ? "Regenerate" : "Generate"}
            </Button>
          </div>

          {/* The hook already toasts, but a toast is gone in four seconds and
              the dialog is still open. Say it where the result was expected. */}
          {aiSummary.isError && (
            <div
              role="alert"
              className="flex items-center gap-2 text-sm text-destructive"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                {mutationErrorMessage(aiSummary.error, "Couldn't draft a summary.")}
              </span>
              <Button variant="outline" size="sm" onClick={handleGenerate}>
                Retry
              </Button>
            </div>
          )}

          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            // Nothing has happened yet, and the placeholder must not read as
            // though it did: no "will appear here" over a failed draft.
            placeholder={
              aiSummary.isError
                ? "Nothing drafted yet. Retry, or write your own."
                : "Choose a style and press Generate. You can edit the draft before copying."
            }
            className="min-h-48 resize-none text-sm"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleCopy} disabled={!summary} className="gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy to clipboard"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
