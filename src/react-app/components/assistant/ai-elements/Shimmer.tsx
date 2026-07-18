import { cn } from "@/lib/utils";

/**
 * A "thinking" text shimmer for streaming/tool-call gaps. Adapted from the
 * fold.run ai-elements shimmer, reimplemented as a clipped background sweep so
 * it needs no animation library — just the `shimmer` keyframe in index.css.
 */
export function Shimmer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "animate-shimmer bg-clip-text text-transparent [background-size:200%_100%]",
        className
      )}
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--muted-foreground) 0%, var(--muted-foreground) 35%, var(--foreground) 50%, var(--muted-foreground) 65%, var(--muted-foreground) 100%)",
      }}
    >
      {children}
    </span>
  );
}
