import { Loader2 } from "lucide-react";

/** Centered spinner shown while a lazily-loaded route chunk resolves. */
export function PageFallback() {
  return (
    <div
      className="flex h-full items-center justify-center py-24"
      role="status"
      aria-label="Loading"
    >
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
