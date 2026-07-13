import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
      />
      <Button asChild className="mt-2">
        <Link to="/">Back to Timer</Link>
      </Button>
    </div>
  );
}
