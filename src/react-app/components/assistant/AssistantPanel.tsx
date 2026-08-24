import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Sparkles,
  CalendarClock,
  Clock,
  Play,
  Hourglass,
  Coffee,
  X,
  CheckCircle2,
  Eraser,
} from "lucide-react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAssistantStore } from "@/stores/assistantStore";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { useAssistantNudges, useTrackNudgeEvent } from "@/hooks/useAssistant";
import { useTimer } from "@/hooks/useTimer";
import type { AssistantNudge } from "@shared/schemas";
import { SuggestionChips } from "./ai-elements/SuggestionChips";
import { ToolCard } from "./ai-elements/ToolCard";
import { AssistantMarkdown } from "./ai-elements/AssistantMarkdown";
import { MessageActions } from "./ai-elements/MessageActions";
import { PromptInput } from "./ai-elements/PromptInput";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./ai-elements/Conversation";

const NUDGE_ICONS: Record<AssistantNudge["kind"], typeof CalendarClock> = {
  untracked_meeting: CalendarClock,
  meeting_now: Play,
  meeting_soon: Clock,
  long_timer: Hourglass,
  nothing_tracked: Coffee,
};

/**
 * Suggestion chips follow the user's context: the reports page leads with
 * summaries, project/client/task pages with per-project breakdowns, and the
 * timer views with tracking gaps. A running timer swaps the "start a timer"
 * chip for a check-in on the current one.
 */
function useContextualSuggestions(): string[] {
  const { pathname } = useLocation();
  const runningEntry = useTimerStore((s) => s.runningEntry);

  return useMemo(() => {
    const timerChip = runningEntry
      ? "How long has my timer been running?"
      : "Start a timer for my current meeting";
    if (pathname.startsWith("/reports")) {
      return [
        "Summarize my time this week",
        "How much have I billed today?",
        "What haven't I tracked yet?",
        timerChip,
      ];
    }
    if (/^\/(projects|clients|tasks)/.test(pathname)) {
      return [
        "Which projects got my time this week?",
        "What haven't I tracked yet?",
        timerChip,
        "What's next on my calendar?",
      ];
    }
    return [
      "What haven't I tracked yet?",
      "How much have I billed today?",
      timerChip,
      "What's next on my calendar?",
    ];
  }, [pathname, runningEntry]);
}

function NudgeCard({ nudge }: { nudge: AssistantNudge }) {
  const dismissNudge = useAssistantStore((s) => s.dismissNudge);
  const trackNudgeEvent = useTrackNudgeEvent();
  const { startTimer, stopTimer } = useTimer();
  const Icon = NUDGE_ICONS[nudge.kind];

  const trackEvent = () => {
    if (!nudge.event) return;
    trackNudgeEvent.mutate(
      {
        calendarEventId: nudge.event.calendarEventId,
        title: nudge.event.title,
        start: nudge.event.start,
        stop: nudge.event.stop,
      },
      { onSuccess: () => dismissNudge(nudge.id) }
    );
  };

  const startFromEvent = () => {
    startTimer({ description: nudge.event?.title ?? "" });
    dismissNudge(nudge.id);
  };

  // "Your timer has been running for 18h — still on it?" used to offer nothing
  // but a chat window. The nudge names the problem, so it should carry the fix:
  // stopping is the whole answer, and the entry survives it (unlike Discard),
  // so it needs no confirmation — same grammar as the timer bar's own Stop.
  const stopFromNudge = () => {
    stopTimer();
    dismissNudge(nudge.id);
  };

  return (
    <div className="flex items-start gap-2.5 rounded-lg border bg-card p-3 shadow-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{nudge.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{nudge.body}</p>
        {(nudge.kind === "untracked_meeting" ||
          nudge.kind === "meeting_now" ||
          nudge.kind === "long_timer") && (
          <div className="mt-2">
            {nudge.kind === "untracked_meeting" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={trackEvent}
                disabled={trackNudgeEvent.isPending}
              >
                {trackNudgeEvent.isPending ? "Adding…" : "Add to timesheet"}
              </Button>
            ) : nudge.kind === "long_timer" ? (
              <Button variant="outline" size="sm" onClick={stopFromNudge}>
                Stop timer
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={startFromEvent}>
                Start timer
              </Button>
            )}
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0 text-muted-foreground"
        onClick={() => dismissNudge(nudge.id)}
        aria-label="Dismiss nudge"
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/**
 * Right-side sheet hosting the assistant's nudges and streaming chat.
 * Lazy-mounted from AppShell on first open (this module pulls the whole
 * agents/AI SDK chain, ~a quarter of the entry chunk); the ⌘I shortcut lives in
 * AppShell so it works before this chunk has ever loaded.
 */
export function AssistantPanel() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const markSeen = useAssistantStore((s) => s.markSeen);
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const { nudges } = useAssistantNudges();
  const suggestions = useContextualSuggestions();
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // The structured, review-before-save path. Close the sheet first so the two
  // modals (sheet + dialog) don't stack their focus traps.
  const logTime = () => {
    setOpen(false);
    openQuickAdd();
  };

  const [input, setInput] = useState("");

  // One ChatAgent per workspace; the worker pins the instance to the caller's
  // workspace server-side, so a fixed name here is safe (see worker/index.ts).
  const agent = useAgent({ agent: "chat-agent", name: "assistant" });
  const {
    messages,
    sendMessage,
    status,
    stop,
    regenerate,
    clearHistory,
    addToolApprovalResponse,
    isStreaming,
  } = useAgentChat({
    agent,
    // Sent per request; ChatAgent.onChatMessage reads options.body for local time.
    body: () => ({ timezoneOffsetMinutes: new Date().getTimezoneOffset() }),
  });

  const busy = status === "submitted" || status === "streaming" || isStreaming;
  const lastAssistantId = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant")?.id,
    [messages]
  );

  // The assistant is "thinking" when a turn is in flight but no assistant text
  // has streamed in yet (covers the pre-first-token and tool round-trip gaps).
  const showThinking = useMemo(() => {
    if (!busy) return false;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const hasText = lastAssistant?.parts.some((p) => p.type === "text" && p.text.trim());
    return !hasText;
  }, [busy, messages]);

  // Viewing the panel counts as seeing every nudge in it — silences pending alerts.
  useEffect(() => {
    if (open && nudges.length) markSeen(nudges.map((n) => n.id));
  }, [open, nudges, markSeen]);

  const send = (content: string) => {
    const text = content.trim();
    if (!text || busy) return;
    setInput("");
    sendMessage({ text });
  };

  const approve = (id: string, approved: boolean) => addToolApprovalResponse({ id, approved });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        // Input-first: land ready to type instead of focusing the close button.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          promptRef.current?.focus();
        }}
      >
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Assistant
          </SheetTitle>
          <SheetDescription>
            Keeps an eye on your calendar and timesheet so billable time doesn't slip.
          </SheetDescription>
        </SheetHeader>

        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="p-4">
            {/* Nudges */}
            <div className="space-y-2">
              {nudges.length > 0 ? (
                nudges.map((n) => <NudgeCard key={n.id} nudge={n} />)
              ) : (
                <div className="flex items-center gap-2.5 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  All caught up — nothing needs your attention right now.
                </div>
              )}
            </div>

            {/* Conversation */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                {/* Shortcut to the structured, review-before-save entry form. */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 rounded-full text-xs"
                  onClick={logTime}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Log time…
                </Button>
                {messages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-muted-foreground"
                    onClick={() => clearHistory()}
                    disabled={busy}
                  >
                    <Eraser className="h-3.5 w-3.5" /> Clear chat
                  </Button>
                )}
              </div>

              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Ask about your day, or tell me to start a timer or track a meeting — or use
                    “Log time…” for a reviewable entry form.
                  </p>
                  <SuggestionChips suggestions={suggestions} onSelect={send} disabled={busy} />
                </div>
              )}

              {messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === "user"
                      ? "ml-8 rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap"
                      : "group mr-4 flex gap-2"
                  }
                >
                  {m.role === "assistant" && (
                    <Sparkles className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    {m.parts.map((part, i) => {
                      if (part.type === "text") {
                        return m.role === "user" ? (
                          <span key={i}>{part.text}</span>
                        ) : (
                          <AssistantMarkdown key={i} text={part.text} />
                        );
                      }
                      if (typeof part.type === "string" && part.type.startsWith("tool-")) {
                        return <ToolCard key={i} part={part} onApprove={approve} />;
                      }
                      return null;
                    })}
                    {m.role === "assistant" && (
                      <MessageActions
                        message={m}
                        canRegenerate={m.id === lastAssistantId && !busy}
                        onRegenerate={() => regenerate()}
                      />
                    )}
                  </div>
                </div>
              ))}

              {showThinking && (
                <div className="mr-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner size="sm" />
                  <span>Thinking…</span>
                </div>
              )}
            </div>
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t p-3">
          <PromptInput
            textareaRef={promptRef}
            value={input}
            onChange={setInput}
            onSubmit={send}
            onStop={() => stop()}
            busy={busy}
            status={status}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
