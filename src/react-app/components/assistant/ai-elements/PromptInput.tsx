import { useCallback, useState, type KeyboardEvent, type Ref } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Auto-growing chat composer (fold.run ai-elements/prompt-input, trimmed to our
 * theme and deps — no attachments/model-selector). A form-wrapped Textarea that
 * grows with content via `field-sizing-content`, submits on Enter (Shift+Enter
 * for a newline, IME-composition safe), and an integrated send/stop button that
 * mirrors the turn state.
 */
export function PromptInput({
  value,
  onChange,
  onSubmit,
  onStop,
  busy = false,
  status,
  placeholder = "Ask the assistant…",
  ariaLabel = "Message the Assistant",
  textareaRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop: () => void;
  busy?: boolean;
  /** Pending state before the first token — shows a spinner in the stop button. */
  status?: "ready" | "submitted" | "streaming" | "error";
  placeholder?: string;
  ariaLabel?: string;
  /** Lets the host focus the composer (e.g. when the panel opens). */
  textareaRef?: Ref<HTMLTextAreaElement>;
}) {
  const [isComposing, setIsComposing] = useState(false);
  const canSend = value.trim().length > 0 && !busy;

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || busy) return;
    onSubmit(text);
  }, [value, busy, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "Enter") return;
      // Let IME composition and Shift+Enter fall through to insert a newline.
      if (isComposing || e.nativeEvent.isComposing || e.shiftKey) return;
      e.preventDefault();
      submit();
    },
    [isComposing, submit]
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn(
        "flex items-end gap-2 rounded-lg border bg-transparent p-1.5 shadow-xs",
        "transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
      )}
    >
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        rows={1}
        className="max-h-40 min-h-9 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
      />
      {busy ? (
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className="shrink-0"
          onClick={onStop}
          aria-label="Stop"
          title="Stop"
        >
          {status === "submitted" ? (
            <Spinner />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon-sm"
          className="shrink-0"
          disabled={!canSend}
          aria-label="Send message"
          title="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      )}
    </form>
  );
}
