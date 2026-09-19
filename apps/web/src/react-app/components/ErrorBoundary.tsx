import { Component, type ReactNode } from "react";
import { TriangleAlert, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Outermost catch-all. Route-level errors are handled by RouteErrorBoundary
 * (wired via `errorElement` in App.tsx); this class boundary only sees crashes
 * that happen above the router — e.g. in providers rendered around it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("App error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8 text-center">
          <TriangleAlert className="mb-4 h-10 w-10 text-muted-foreground/30" />
          <h1 className="mb-2 text-2xl font-semibold text-foreground">
            Something went wrong
          </h1>
          <p className="mb-6 max-w-md text-sm text-muted-foreground">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <Button onClick={() => window.location.reload()}>
            <RotateCw />
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
