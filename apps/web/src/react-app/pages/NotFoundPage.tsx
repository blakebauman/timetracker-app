import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";

export function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      {/* Same brand treatment as the auth pages: the mark over a soft red
          halo. It stands in for the empty-state icon here. */}
      <div className="relative mb-6 flex items-center justify-center">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl"
        />
        <BrandMark className="relative size-16" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The page you're looking for doesn't exist or has moved.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Back to Timer</Link>
      </Button>
    </div>
  );
}
