import type { ComponentProps } from "react";
import { ArrowDown } from "lucide-react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Auto-following scroll container for the chat log (fold.run ai-elements/
 * conversation, trimmed to what the assistant sheet uses). Wraps
 * use-stick-to-bottom so new messages/streaming tokens keep the view pinned to
 * the bottom, but stop yanking the user down the moment they scroll up to read.
 * Replaces the hand-rolled scrollRef + atBottom bookkeeping in AssistantPanel.
 */
export function Conversation({ className, ...props }: ComponentProps<typeof StickToBottom>) {
  return (
    <StickToBottom
      className={cn("relative overflow-hidden", className)}
      initial="smooth"
      resize="smooth"
      role="log"
      {...props}
    />
  );
}

export function ConversationContent({
  className,
  ...props
}: ComponentProps<typeof StickToBottom.Content>) {
  return <StickToBottom.Content className={className} {...props} />;
}

/** Floating "jump to latest" pill — only shown while scrolled away from bottom. */
export function ConversationScrollButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <Button
      variant="outline"
      size="icon-sm"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md"
      onClick={() => scrollToBottom()}
      aria-label="Scroll to latest"
      title="Scroll to latest"
    >
      <ArrowDown className="h-4 w-4" />
    </Button>
  );
}
