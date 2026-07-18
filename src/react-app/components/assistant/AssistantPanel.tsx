import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  CalendarClock,
  Clock,
  Play,
  Hourglass,
  Coffee,
  Send,
  X,
  CheckCircle2,
} from "lucide-react";
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
import {
  useAssistantNudges,
  useAssistantChat,
  useTrackNudgeEvent,
} from "@/hooks/useAssistant";
import { useTimer } from "@/hooks/useTimer";
import type { AssistantNudge, AssistantChatMessage } from "@shared/schemas";

const NUDGE_ICONS: Record<AssistantNudge["kind"], typeof CalendarClock> = {
  untracked_meeting: CalendarClock,
  meeting_now: Play,
  meeting_soon: Clock,
  long_timer: Hourglass,
  nothing_tracked: Coffee,
};

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

/** Right-side sheet hosting Aski's nudges and chat. Mounted once in AppShell. */
export function AssistantPanel() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const messages = useAssistantStore((s) => s.messages);
  const addMessage = useAssistantStore((s) => s.addMessage);
  const markSeen = useAssistantStore((s) => s.markSeen);
  const { nudges } = useAssistantNudges();
  const chat = useAssistantChat();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Viewing the panel counts as seeing every nudge in it — pending toast/
  // notification alerts for them are silenced (the notifier keys off `seen`).
  useEffect(() => {
    if (open && nudges.length) markSeen(nudges.map((n) => n.id));
  }, [open, nudges, markSeen]);

  // Keep the latest message (or the thinking indicator) in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, chat.isPending, open]);

  const send = () => {
    const content = input.trim();
    if (!content || chat.isPending) return;
    setInput("");
    addMessage({ role: "user", content });
    const outgoing: AssistantChatMessage[] = [...messages, { role: "user", content }];
    chat.mutate(
      {
        messages: outgoing.slice(-12),
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      },
      { onSuccess: ({ reply }) => addMessage({ role: "assistant", content: reply }) }
    );
  };

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

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
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
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Ask about your day — “what haven't I tracked yet?”, “how much have I
                billed today?”, “what's next on my calendar?”
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-8 rounded-lg bg-muted px-3 py-2 text-sm"
                    : "mr-8 flex gap-2 text-sm"
                }
              >
                {m.role === "assistant" && (
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="whitespace-pre-wrap">{m.content}</span>
              </div>
            ))}
            {chat.isPending && (
              <div className="mr-8 flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                Thinking…
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t p-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="Ask Aski…"
            aria-label="Message Aski"
          />
          <Button
            size="icon-sm"
            className="shrink-0"
            onClick={send}
            disabled={!input.trim() || chat.isPending}
            aria-label="Send message"
            title="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
