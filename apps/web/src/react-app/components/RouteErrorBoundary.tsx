import { useEffect } from "react";
import { Link, useRouteError, isRouteErrorResponse } from "react-router-dom";
import { TriangleAlert, RotateCw, Home, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

interface RouteErrorBoundaryProps {
  /** Center on a standalone full-height surface (use outside the app shell). */
  fullScreen?: boolean;
}

/** Normalize whatever React Router throws into presentable pieces. */
function describeError(error: unknown): {
  title: string;
  description: string;
  message: string;
  stack?: string;
} {
  if (isRouteErrorResponse(error)) {
    return {
      title: `${error.status} ${error.statusText}`.trim(),
      description:
        typeof error.data === "string" && error.data
          ? error.data
          : "The page couldn't be loaded. Please try again.",
      message: `${error.status} ${error.statusText}`,
    };
  }
  if (error instanceof Error) {
    return {
      title: "Something went wrong",
      description:
        "An unexpected error interrupted this page. You can retry or head back to the timer.",
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    title: "Something went wrong",
    description:
      "An unexpected error interrupted this page. You can retry or head back to the timer.",
    message: String(error),
  };
}

export function RouteErrorBoundary({ fullScreen = false }: RouteErrorBoundaryProps) {
  const error = useRouteError();
  const { title, description, message, stack } = describeError(error);

  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  const details = stack ? `${message}\n\n${stack}` : message;

  const copyDetails = () => {
    void navigator.clipboard
      .writeText(details)
      .then(() => toast.success("Error details copied"))
      .catch(() => toast.error("Couldn't copy to clipboard"));
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-6",
        fullScreen ? "min-h-screen bg-background" : "h-full"
      )}
    >
      <EmptyState
        icon={TriangleAlert}
        title={title}
        description={description}
        className="py-8"
      />

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => window.location.reload()}>
          <RotateCw />
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link to="/">
            <Home />
            Back to Timer
          </Link>
        </Button>
      </div>

      {import.meta.env.DEV && (
        <details className="mt-6 w-full max-w-lg rounded-lg border bg-muted/40 text-left">
          <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium text-muted-foreground">
            Error details (dev only)
          </summary>
          <div className="border-t px-4 py-3">
            <div className="mb-2 flex justify-end">
              <Button variant="ghost" size="xs" onClick={copyDetails}>
                <Copy />
                Copy details
              </Button>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
              {details}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}
