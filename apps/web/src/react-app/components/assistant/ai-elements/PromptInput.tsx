import { useCallback, useState, type KeyboardEvent, type Ref } from "react";
import { ArrowUp, Square } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { LIT_DISC } from "@/components/ui/lit-disc";

/**
 * The chat composer: AI Elements' Prompt Input — an InputGroup holding the
 * textarea, with the send/stop control in a block-end addon — trimmed to what
 * this Assistant has (no attachments, no model picker). The textarea grows with
 * content via `field-sizing-content`, submits on Enter (Shift+Enter for a
 * newline, IME-composition safe), and the one control mirrors the turn state.
 * ArrowUp in an empty composer recalls the last thing you sent, to fix a typo
 * or ask again.
 */
export function PromptInput({
  value,
  onChange,
  onSubmit,
  onStop,
  busy = false,
  status,
  placeholder = "Ask anything…",
  ariaLabel = "Message the Assistant",
  textareaRef,
  offline = false,
  onRecall,
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
  /** No connection to the agent yet: Send still works — the host queues the text — but says so. */
  offline?: boolean;
  /** The last message sent, for ArrowUp in an empty composer. */
  onRecall?: () => string | undefined;
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
      if (e.key === "ArrowUp" && !value && onRecall) {
        const last = onRecall();
        if (last) {
          e.preventDefault();
          onChange(last);
        }
        return;
      }
      if (e.key !== "Enter") return;
      // Let IME composition and Shift+Enter fall through to insert a newline.
      if (isComposing || e.nativeEvent.isComposing || e.shiftKey) return;
      e.preventDefault();
      submit();
    },
    [isComposing, submit, value, onRecall, onChange]
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* A recessed well on the sheet with the send disc as the panel's one
          red element. The group's own capsule is squared to a container: a
          multi-line field is a container, not a control (The Geometry Rule).
          The disc rides at the inline end, bottom-aligned as the field grows:
          a block-end toolbar row is for attachments and a model picker, and
          for one button it only made the composer a row taller. */}
      <InputGroup className="h-auto items-end rounded-container bg-background dark:bg-background">
        <InputGroupTextarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          rows={1}
          className="max-h-40 min-h-12 px-3.5 py-3.5"
        />
        {/* Inset evenly from the field's edge: the addon's default -mr-1 pulled
            the disc 5px from the right edge against 9px from the bottom, so it
            crowded the corner once the field grew. */}
        <InputGroupAddon align="inline-end" className="py-2 pr-2 has-[>button]:mr-0">
          {busy ? (
            <InputGroupButton
              size="icon-sm"
              variant="outline"
              onClick={onStop}
              aria-label="Stop"
              title="Stop"
            >
              {/* Filled, so it reads as "stop" rather than an empty frame. */}
              {status === "submitted" ? <Spinner /> : <Square className="size-3 fill-current" />}
            </InputGroupButton>
          ) : (
            <InputGroupButton
              type="submit"
              size="icon-sm"
              variant="default"
              // Lit only when there's something to send: an empty composer
              // used to show a faded red disc, the brand light spent on
              // nothing. The house ring vanishes on the red fill, so it lifts
              // off on an offset like the Start disc's.
              className={cn(
                "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                LIT_DISC,
                "disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
              )}
              disabled={!canSend}
              aria-label="Send message"
              title={offline ? "Send when the Assistant connects" : "Send"}
            >
              {/* An arrow, not a paper plane: the plane's mass sits low-left
                  and read as off-centre in a round button. */}
              <ArrowUp />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
