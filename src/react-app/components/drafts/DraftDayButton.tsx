import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** The Timer header's entry point into drafting + review. */
export function DraftDayButton({
  onClick,
  pending,
  pendingCount,
  className,
}: {
  onClick: () => void;
  pending: boolean;
  pendingCount: number;
  className?: string;
}) {
  return (
    <Button
      variant={pendingCount > 0 ? "secondary" : "outline"}
      size="sm"
      className={cn("h-8 gap-1.5", className)}
      onClick={onClick}
      disabled={pending}
      title="Propose entries for the day from your calendar, gaps and weekly habits"
    >
      {pending ? <Spinner size="sm" /> : <Wand2 className="h-3.5 w-3.5" />}
      {pendingCount > 0 ? `Review ${pendingCount}` : "Draft day"}
    </Button>
  );
}
