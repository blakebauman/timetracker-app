import { Spinner } from "@/components/ui/spinner";

/** Centered spinner shown while a lazily-loaded route chunk resolves. */
export function PageFallback() {
  return (
    <div
      className="flex h-full items-center justify-center py-24"
      role="status"
      aria-label="Loading"
    >
      <Spinner size="lg" className="text-muted-foreground" />
    </div>
  );
}
