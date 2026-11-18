"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { CheckIcon, CopyIcon } from "lucide-react"

// AI Elements' Code Block (shadcn registry), trimmed to the Assistant's
// ``` fence: a recessed, horizontally scrolling block with a Copy action. The
// registry's header/title/footer, destructive variant, wrapping, line numbers
// and diff-line variants were first-load CSS for nothing — add one back when
// something renders it.

function CodeBlock({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="code-block"
      className={cn(
        "group/code-block relative flex w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background text-xs text-foreground has-[>[data-slot=code-block-content]:focus-visible]:border-ring has-[>[data-slot=code-block-content]:focus-visible]:ring-[3px] has-[>[data-slot=code-block-content]:focus-visible]:ring-ring/50",
        className
      )}
      {...props}
    />
  )
}

/** Floats in the top-right corner; shown on hover or focus, always under touch. */
function CodeBlockActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="code-block-actions"
      className={cn(
        "absolute end-2 top-2 z-sticky flex items-center gap-1 opacity-0 transition-opacity duration-fast ease-out-quart group-focus-within/code-block:opacity-100 group-hover/code-block:opacity-100 pointer-coarse:opacity-100 *:[button]:bg-background *:[button]:ring-1 *:[button]:ring-foreground/10",
        className
      )}
      {...props}
    />
  )
}

function CodeBlockCopyButton({
  value,
  variant = "ghost",
  size = "icon-xs",
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button> & { value: string }) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timeout)
  }, [copied])

  return (
    <>
      <Button
        data-slot="code-block-copy-button"
        variant={variant}
        size={size}
        aria-label={copied ? "Copied" : "Copy"}
        className={className}
        onClick={(event) => {
          onClick?.(event)
          navigator.clipboard
            .writeText(value)
            .then(() => setCopied(true))
            .catch(() => {})
        }}
        {...props}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </>
  )
}

/**
 * The scroll region. In the tab order (and ringed via CodeBlock) because a
 * scroll region a keyboard can't reach hides whatever is past its edge.
 */
function CodeBlockContent({ className, children, ...props }: React.ComponentProps<"pre">) {
  return (
    <pre
      data-slot="code-block-content"
      dir="ltr"
      tabIndex={0}
      className={cn(
        "min-h-0 min-w-0 scroll-fade-x overflow-auto px-3 py-3 text-start font-mono leading-relaxed outline-none",
        className
      )}
      {...props}
    >
      <code data-slot="code-block-code" className="grid min-h-lh min-w-max content-start">
        {children}
      </code>
    </pre>
  )
}

function CodeBlockLine({ className, children, ...props }: React.ComponentProps<"span">) {
  // An empty line holds a newline so copying a selection keeps blank lines.
  const empty =
    children === undefined ||
    children === null ||
    children === "" ||
    (Array.isArray(children) && children.length === 0)

  return (
    <span data-slot="code-block-line" className={cn("block min-h-lh", className)} {...props}>
      <span data-slot="code-block-line-content" className="min-w-0">
        {empty ? "\n" : children}
      </span>
    </span>
  )
}

export { CodeBlock, CodeBlockActions, CodeBlockCopyButton, CodeBlockContent, CodeBlockLine }
