import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  CalendarClock,
  Clock,
  Play,
  Hourglass,
  Coffee,
  Send,
  Square,
  X,
  CheckCircle2,
  ArrowDown,
  Eraser,
} from "lucide-react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAssistantStore } from "@/stores/assistantStore";
import { useAssistantNudges, useTrackNudgeEvent } from "@/hooks/useAssistant";
import { useTimer } from "@/hooks/useTimer";
import type { AssistantNudge } from "@shared/schemas";
import { Shimmer } from "./ai-elements/Shimmer";
import { SuggestionChips } from "./ai-elements/SuggestionChips";
import { ToolCard } from "./ai-elements/ToolCard";
import { AskiMarkdown } from "./ai-elements/AskiMarkdown";
import { MessageActions } from "./ai-elements/MessageActions";

const NUDGE_ICONS: Record<AssistantNudge["kind"], typeof CalendarClock> = {
  untracked_meeting: CalendarClock,
  meeting_now: Play,
  meeting_soon: Clock,
  long_timer: Hourglass,
  nothing_tracked: Coffee,
};

const SUGGESTIONS = [
  "What haven't I tracked yet?",
  "How much have I billed today?",
  "Start a timer for my current meeting",
  "What's next on my calendar?",
];

function NudgeCard({ nudge }: { nudge: AssistantNudge }) {
  const dismissNudge = useAssistantStore((s) => s.dismissNudge);
  const trackNudgeEvent = useTrackNudgeEvent();
  const { startTimer } = useTimer();
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

  return (
    <div className="flex items-start gap-2.5 rounded-lg border bg-card p-3 shadow-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{nudge.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{nudge.body}</p>
        {(nudge.kind === "untracked_meeting" || nudge.kind === "meeting_now") && (
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

/** Right-side sheet hosting Aski's nudges and streaming chat. Mounted once in AppShell. */
export function AssistantPanel() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const markSeen = useAssistantStore((s) => s.markSeen);
  const { nudges } = useAssistantNudges();

  const [input, setInput] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // One ChatAgent per workspace; the worker pins the instance to the caller's
  // workspace server-side, so a fixed name here is safe (see worker/index.ts).
  const agent = useAgent({ agent: "chat-agent", name: "aski" });
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

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };
  const scrollToBottom = () =>
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });

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

  // Follow the latest message while pinned to the bottom; if the user has
  // scrolled up to read, don't yank them back down (the jump button handles it).
  useEffect(() => {
    if (atBottom) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, showThinking, open, atBottom]);

  const send = (content: string) => {
    const text = content.trim();
    if (!text || busy) return;
    setInput("");
    sendMessage({ text });
  };

  const approve = (id: string, approved: boolean) => addToolApprovalResponse({ id, approved });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Aski
          </SheetTitle>
          <SheetDescription>
            Keeps an eye on your calendar and timesheet so billable time doesn't slip.
          </SheetDescription>
        </SheetHeader>

        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto p-4">
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
              {messages.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Ask about your day, or tell me to start a timer, log time, or track a meeting.
                  </p>
                  <SuggestionChips suggestions={SUGGESTIONS} onSelect={send} disabled={busy} />
                </div>
              ) : (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-muted-foreground"
                    onClick={() => clearHistory()}
                    disabled={busy}
                  >
                    <Eraser className="h-3.5 w-3.5" /> Clear chat
                  </Button>
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
                          <AskiMarkdown key={i} text={part.text} />
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
                <div className="mr-4 flex items-center gap-2 text-sm">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <Shimmer>Thinking…</Shimmer>
                </div>
              )}
            </div>
          </div>

          {!atBottom && (
            <Button
              variant="outline"
              size="icon-sm"
              className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md"
              onClick={scrollToBottom}
              aria-label="Scroll to latest"
              title="Scroll to latest"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 border-t p-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send(input);
            }}
            placeholder="Ask Aski…"
            aria-label="Message Aski"
          />
          {busy ? (
            <Button
              size="icon-sm"
              variant="outline"
              className="shrink-0"
              onClick={() => stop()}
              aria-label="Stop"
              title="Stop"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon-sm"
              className="shrink-0"
              onClick={() => send(input)}
              disabled={!input.trim()}
              aria-label="Send message"
              title="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
