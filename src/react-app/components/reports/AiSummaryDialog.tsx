import { useState } from "react";
import { Sparkles, Copy, Check } from "lucide-react";
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
import { useAiSummary } from "@/hooks/useAi";

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
    setCopied(false);
    aiSummary.mutate({ since, until, style }, { onSuccess: (data) => setSummary(data.summary) });
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
  };

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setSummary("");
      setCopied(false);
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
        <TooltipContent>Draft AI summary</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>AI-drafted summary</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2">
            <Select value={style} onValueChange={(v) => setStyle(v as "bullets" | "narrative")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bullets">Bullet points</SelectItem>
                <SelectItem value="narrative">Narrative</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleGenerate} disabled={aiSummary.isPending}>
              {aiSummary.isPending ? "Drafting…" : summary ? "Regenerate" : "Generate"}
            </Button>
          </div>

          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Generated summary will appear here — edit freely before copying."
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
