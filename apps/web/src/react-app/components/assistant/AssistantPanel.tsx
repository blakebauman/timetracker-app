import { memo, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sparkles,
  CalendarClock,
  Clock,
  Play,
  Hourglass,
  Coffee,
  TrendingUp,
  Flag,
  ListChecks,
  X,
  CheckCircle2,
  Eraser,
  AlertCircle,
  ChevronDown,
  Brain,
  WifiOff,
} from "lucide-react";
import { useAgent } from "agents/react";
import { useAgentChat, getToolPartState } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { useAssistantStore } from "@/stores/assistantStore";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { useAssistantNudges, useTrackNudgeEvent } from "@/hooks/useAssistant";
import { useCalendarStatus } from "@/hooks/useCalendarSync";
import { useTimer } from "@/hooks/useTimer";
import type { AssistantNudge } from "@timetracker/core/schemas";
import { SuggestionChips } from "./ai-elements/SuggestionChips";
import { ToolCard } from "./ai-elements/ToolCard";
import { AssistantMarkdown } from "./ai-elements/AssistantMarkdown";
import { MessageActions } from "./ai-elements/MessageActions";
import { useAgentConnection, useSlowReply } from "./useAgentConnection";
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
  budget_risk: TrendingUp,
  deadline_risk: Flag,
  tasks_overdue: ListChecks,
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
  // "Start a timer for my current meeting" is a dead end without a calendar,
  // and it was the first thing a brand-new account was offered.
  const { data: calendars = [] } = useCalendarStatus();
  const hasCalendar = calendars.some((c) => c.connected);

  return useMemo(() => {
    const timerChip = runningEntry
      ? "How long has my timer been running?"
      : hasCalendar
        ? "Start a timer for my current meeting"
        : "What's on my plan today?";
    const calendarChip = hasCalendar ? "What's next on my calendar?" : "Plan the rest of my day";
    if (pathname.startsWith("/reports")) {
      return [
        "Summarize my time this week",
        "How much have I tracked today?",
        "What haven't I tracked yet?",
        timerChip,
      ];
    }
    if (/^\/(projects|clients|tasks)/.test(pathname)) {
      return [
        "Which projects got my time this week?",
        pathname.startsWith("/tasks") ? "Plan the rest of my day" : "What haven't I tracked yet?",
        timerChip,
        pathname.startsWith("/tasks") ? "What haven't I tracked yet?" : calendarChip,
      ];
    }
    return [
      "What haven't I tracked yet?",
      "How much have I tracked today?",
      timerChip,
      calendarChip,
    ];
  }, [pathname, runningEntry, hasCalendar]);
}

function NudgeCard({ nudge }: { nudge: AssistantNudge }) {
  const dismissNudge = useAssistantStore((s) => s.dismissNudge);
  const setAssistantOpen = useAssistantStore((s) => s.setOpen);
  const navigate = useNavigate();
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
    <div className="flex items-start gap-2.5 rounded-container border bg-card p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{nudge.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{nudge.body}</p>
        {/* Task nudges point at the list that fixes them; the panel closes
            so the list isn't hidden behind it. */}
        {(nudge.kind === "deadline_risk" || nudge.kind === "tasks_overdue") && (
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigate("/tasks");
                setAssistantOpen(false);
              }}
            >
              Open tasks
            </Button>
          </div>
        )}
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
        // Named for its nudge: two "Dismiss nudge" buttons in a screen
        // reader's list couldn't be told apart.
        aria-label={`Dismiss: ${nudge.title}`}
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function textOf(m: UIMessage): string {
  return m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

/**
 * One turn of the thread. Memoized: the hook hands back a new object only for
 * the message that changed, so a streamed token re-renders the reply being
 * written instead of re-parsing every reply and tool row above it.
 */
const MessageItem = memo(function MessageItem({
  message: m,
  canRegenerate,
  onApprove,
  onRegenerate,
}: {
  message: UIMessage;
  canRegenerate: boolean;
  onApprove: (id: string, approved: boolean) => void;
  onRegenerate: () => void;
}) {
  // Two bubbles, one grammar: the user's turn is recessed on the muted step,
  // the Assistant's is a card on the rack. Neither carries the brand red —
  // that's for the Send disc.
  if (m.role === "user") {
    return (
      <div className="ml-8 rounded-container border bg-muted px-3 py-2 text-sm whitespace-pre-wrap wrap-anywhere">
        {m.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}
      </div>
    );
  }
  // Copy / Regenerate hang under the card rather than inside it: hover-revealed
  // inside, they left an empty band at the foot of every reply that read as
  // stray padding.
  return (
    <div className="group mr-4 space-y-1">
      <div className="flex gap-2 rounded-container border bg-card px-3 py-2.5">
        <Sparkles className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-2">
          {m.parts.map((part, i) => {
            if (part.type === "text") return <AssistantMarkdown key={i} text={part.text} />;
            if (typeof part.type === "string" && part.type.startsWith("tool-")) {
              return <ToolCard key={i} part={part} onApprove={onApprove} />;
            }
            return null;
          })}
        </div>
      </div>
      <MessageActions message={m} canRegenerate={canRegenerate} onRegenerate={onRegenerate} />
    </div>
  );
});

/**
 * Right-side sheet hosting the Assistant: what needs your attention, then the
 * conversation, then one composer. Lazy-mounted from AppShell on first open
 * (this module pulls the whole agents/AI SDK chain, ~a quarter of the entry
 * chunk); the ⌘I shortcut lives in AppShell so it works before this chunk has
 * ever loaded.
 *
 * Nudges and chat share the sheet but not its weight: with no conversation the
 * nudges lead, and once you're talking they fold into one line above the
 * thread, so the conversation isn't pushed below the fold by the inbox.
 */
export function AssistantPanel() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const markSeen = useAssistantStore((s) => s.markSeen);
  const markViewed = useAssistantStore((s) => s.markViewed);
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const navigate = useNavigate();
  const {
    nudges,
    isLoading: nudgesLoading,
    isError: nudgesError,
    refetch: refetchNudges,
  } = useAssistantNudges();
  const [confirmClear, setConfirmClear] = useState(false);
  // null = follow the conversation (open while it's empty, folded once it isn't).
  const [nudgesExpanded, setNudgesExpanded] = useState<boolean | null>(null);
  const suggestions = useContextualSuggestions();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  // Where focus was when the panel opened. The sheet opens from the store
  // (rail launcher, ⌘I, a nudge toast), never a Radix Trigger, so Radix had
  // nothing to return focus to and closing dropped it on <body>.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // The structured, review-before-save path. Close the sheet first so the two
  // modals (sheet + dialog) don't stack their focus traps.
  const logTime = () => {
    setOpen(false);
    openQuickAdd();
  };
  const openMemory = () => {
    setOpen(false);
    navigate("/settings?tab=tracking");
  };

  const [input, setInput] = useState("");

  // One ChatAgent per workspace; the worker pins the instance to the caller's
  // workspace server-side, so a fixed name here is safe (see worker/index.ts).
  const agent = useAgent({ agent: "chat-agent", name: "assistant" });
  // The open handler flushes a message queued while the socket was down; it
  // reads the latest `send` through a ref because `send` needs `offline`.
  const flushQueuedRef = useRef<() => void>(() => {});
  const connection = useAgentConnection(agent, () => flushQueuedRef.current());
  const offline = connection.state !== "open";
  const {
    messages,
    sendMessage,
    status,
    stop,
    regenerate,
    clearHistory,
    addToolApprovalResponse,
    isStreaming,
    error,
  } = useAgentChat({
    agent,
    // Sent per request; ChatAgent.onChatMessage reads options.body for local
    // time. The tools take local wall-clock times and the worker converts them
    // with the zone, so "2pm" means 2pm here — across DST changes too.
    body: () => ({
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });

  const busy = status === "submitted" || status === "streaming" || isStreaming;

  // After an approval the server continues the turn on a resumed stream whose
  // `start` carries no message id, so the SDK (agents 0.24 / ai-chat 0.12)
  // looks for the approved call in a fresh message, can't find it, and fails
  // the turn with "No tool invocation found for tool call ID …" — after the
  // write has landed and the synced messages already show its result. That
  // one error, for a call that has its output, is not a failure; every other
  // error still is.
  const failed = useMemo(() => {
    if (status !== "error") return false;
    const id = /No tool invocation found for tool call ID "([^"]+)"/.exec(error?.message ?? "")?.[1];
    if (!id) return true;
    const settled = messages.some((m) =>
      m.parts.some(
        (p) =>
          "toolCallId" in p &&
          p.toolCallId === id &&
          "state" in p &&
          (p.state === "output-available" || p.state === "output-error" || p.state === "output-denied")
      )
    );
    return !settled;
  }, [status, error, messages]);
  // One backward pass for everything the panel reads off the tail of the
  // thread; this runs on every streamed token.
  const { lastAssistant, lastUserText } = useMemo(() => {
    let assistant: UIMessage | undefined;
    let user: UIMessage | undefined;
    for (let i = messages.length - 1; i >= 0 && !(assistant && user); i--) {
      const m = messages[i];
      if (m.role === "assistant") assistant ??= m;
      else if (m.role === "user") user ??= m;
    }
    return { lastAssistant: assistant, lastUserText: user ? textOf(user) : undefined };
  }, [messages]);
  const lastAssistantId = lastAssistant?.id;

  // The Assistant is "thinking" when a turn is in flight but no assistant text
  // has streamed in yet (covers the pre-first-token and tool round-trip gaps).
  // It reads the thread's last message, not the last assistant one: right
  // after a send that is the user's, and the previous reply's text used to
  // count as this turn's.
  const tail = messages[messages.length - 1];
  const showThinking = busy && !(tail?.role === "assistant" && textOf(tail));
  const [retries, setRetries] = useState(0);
  const stuck = useSlowReply(showThinking, `${messages.length}:${retries}`);

  // Viewing the panel counts as reading every nudge in it: it silences pending
  // alerts, clears the rail badge, and takes down any toast still announcing
  // one — those used to stack over the chips and composer for their 12s.
  useEffect(() => {
    if (!open || !nudges.length) return;
    const ids = nudges.map((n) => n.id);
    markSeen(ids);
    markViewed(ids);
    for (const id of ids) toast.dismiss(id);
  }, [open, nudges, markSeen, markViewed]);

  // The thread is a log, but its live announcements are off: a streaming
  // reply changes its text on every token, and a log reads each change out,
  // so a screen reader heard the answer in fragments. The finished turn is
  // announced once, here, instead.
  const [announcement, setAnnouncement] = useState("");
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy && lastAssistant) {
      const waiting = lastAssistant.parts.some(
        (p) => "toolCallId" in p && getToolPartState(p) === "waiting-approval"
      );
      setAnnouncement(
        waiting ? "The Assistant is waiting for your approval." : textOf(lastAssistant) || "The Assistant replied."
      );
    }
    wasBusy.current = busy;
  }, [busy, lastAssistant]);

  // A message sent before the socket is open used to go nowhere — the bubble
  // appeared and no reply ever came. Now it waits in the composer, marked as
  // queued, and goes the moment the connection opens.
  const [queued, setQueued] = useState(false);
  const send = (content: string) => {
    const text = content.trim();
    if (!text || busy) return;
    if (offline) {
      setInput(text);
      setQueued(true);
      return;
    }
    setQueued(false);
    setInput("");
    sendMessage({ text });
  };
  useEffect(() => {
    // Straight to sendMessage, not `send`: this runs inside the socket's open
    // event, before a render has flipped `offline` back to false.
    flushQueuedRef.current = () => {
      const text = input.trim();
      if (!queued || !text) return;
      setQueued(false);
      setInput("");
      sendMessage({ text });
    };
  });

  const retryStuck = () => {
    setRetries((n) => n + 1);
    stop();
    regenerate();
  };

  // Stable identities for the memoized message rows: the hook's own
  // functions aren't guaranteed stable, so they're read through a ref.
  const actions = useRef({ addToolApprovalResponse, regenerate });
  useEffect(() => {
    actions.current = { addToolApprovalResponse, regenerate };
  });
  const approve = useMemo(
    () => (id: string, approved: boolean) => actions.current.addToolApprovalResponse({ id, approved }),
    []
  );
  const regenerateLast = useMemo(() => () => actions.current.regenerate(), []);

  const hasConversation = messages.length > 0;
  const nudgesOpen = nudgesExpanded ?? !hasConversation;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        // The header draws its own close, so clear-chat and close are one
        // group rather than two absolutes whose offsets had to agree.
        showCloseButton={false}
        // Wider than the 384px sheet default: a conversation with tool rows and
        // a day plan needs the measure (see DESIGN.md, Overlays).
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        // Input-first: land ready to type instead of focusing the close button.
        // Not on a touch screen, though — there the keyboard would rise over
        // the nudges before you'd read them.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          if (!window.matchMedia("(pointer: coarse)").matches) promptRef.current?.focus();
        }}
        // Escape from inside the sheet always closes it. Radix gives Escape
        // to the topmost layer only, and the rail launcher's tooltip — shown
        // when focus comes back to the launcher — could still be registered
        // above a sheet reopened by ⌘I. It took the Escape (and prevented it)
        // and the panel stayed open until a second press. Nothing in the panel
        // claims Escape for itself; the one layer that opens above it, the
        // clear-chat confirm, keeps its Escape — one press dismisses the
        // confirm, not the conversation behind it too.
        onKeyDown={(e) => {
          if (e.key === "Escape" && !confirmClear && e.currentTarget.contains(e.target as Node)) setOpen(false);
        }}
        onCloseAutoFocus={(e) => {
          const el = returnFocusRef.current;
          returnFocusRef.current = null;
          if (el?.isConnected && el !== document.body) {
            e.preventDefault();
            el.focus();
          }
        }}
      >
        {/* A grid, not title-column-beside-buttons: the description runs the
            full width under both, so at large text sizes it isn't squeezed
            into one word per line beside the buttons. */}
        <SheetHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" />
            Assistant
          </SheetTitle>
          <div className="-my-1 -mr-1 flex items-center gap-1">
            {hasConversation && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setConfirmClear(true)}
                disabled={busy}
                aria-label="Clear chat"
                title="Clear chat"
              >
                <Eraser />
              </Button>
            )}
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
                title="Close"
              >
                <X />
              </Button>
            </SheetClose>
          </div>
          <SheetDescription className="col-span-2">Watches your calendar, timesheet and plan.</SheetDescription>
        </SheetHeader>

        <Conversation className="min-h-0 flex-1" aria-live="off">
          <ConversationContent className="p-4">
            {/* What needs your attention */}
            <section aria-label="Needs your attention" className="space-y-2">
              {nudgesLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : nudgesError ? (
                // "All caught up" on a failed fetch would be the one thing
                // the Assistant must never say; name the problem instead.
                <div className="flex items-center gap-2.5 rounded-container border bg-card p-3 text-sm text-muted-foreground">
                  <AlertCircle className="size-4 shrink-0" />
                  <span className="flex-1">Couldn't check your calendar and timesheet.</span>
                  <Button variant="outline" size="xs" onClick={() => refetchNudges()}>
                    Retry
                  </Button>
                </div>
              ) : nudges.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 shrink-0 text-success" />
                  All caught up — nothing needs your attention right now.
                </p>
              ) : (
                <>
                  {hasConversation && (
                    <button
                      type="button"
                      onClick={() => setNudgesExpanded(!nudgesOpen)}
                      aria-expanded={nudgesOpen}
                      className="relative flex w-full items-center gap-2 rounded-full px-1 py-1 text-left pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2.5 pointer-coarse:after:content-[''] text-xs font-medium text-muted-foreground transition-colors duration-fast ease-out-quart hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <ChevronDown
                        className={cn(
                          "size-3.5 transition-transform duration-fast ease-out-quart",
                          !nudgesOpen && "-rotate-90"
                        )}
                      />
                      {nudges.length === 1
                        ? "1 thing needs your attention"
                        : `${nudges.length} things need your attention`}
                    </button>
                  )}
                  {nudgesOpen && nudges.map((n) => <NudgeCard key={n.id} nudge={n} />)}
                </>
              )}
            </section>

            {/* Conversation */}
            <div className="mt-5 space-y-3">
              {!hasConversation && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Ask about your time, or have me log it, start and stop timers, add and tick off
                    tasks, or plan your day. Anything that changes your timesheet or plan waits for
                    your OK.
                  </p>
                  <SuggestionChips
                    suggestions={suggestions}
                    onSelect={send}
                    disabled={busy}
                  />
                  <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                    {/* The structured, review-before-save entry form. */}
                    <Button
                      variant="link"
                      size="xs"
                      className="h-auto px-0 text-muted-foreground hover:text-foreground"
                      onClick={logTime}
                    >
                      <Clock /> Log time with the form
                    </Button>
                    <Button
                      variant="link"
                      size="xs"
                      className="h-auto px-0 text-muted-foreground hover:text-foreground"
                      onClick={openMemory}
                    >
                      <Brain /> What I remember
                    </Button>
                  </div>
                </div>
              )}

              {messages.map((m) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  canRegenerate={m.id === lastAssistantId && !busy}
                  onApprove={approve}
                  onRegenerate={regenerateLast}
                />
              ))}

              {showThinking &&
                (stuck ? (
                  <div
                    role="status"
                    className="mr-4 flex items-center gap-2.5 rounded-container border bg-card px-3 py-2 text-sm"
                  >
                    <AlertCircle className="size-4 shrink-0 text-warning" />
                    <span className="flex-1">No reply yet.</span>
                    <Button variant="outline" size="xs" onClick={retryStuck} disabled={offline}>
                      Try again
                    </Button>
                  </div>
                ) : (
                  <div
                    role="status"
                    className="mr-4 flex items-center gap-2 rounded-container border bg-card px-3 py-2.5 text-sm text-muted-foreground"
                  >
                    <Spinner size="sm" />
                    <span>Thinking…</span>
                  </div>
                ))}

              {failed && (
                // A failed turn used to end in silence — the spinner just went
                // away. Say so, and offer the same retry the message menu has.
                <div className="mr-4 flex items-center gap-2.5 rounded-container border border-destructive/40 bg-card px-3 py-2 text-sm">
                  <AlertCircle className="size-4 shrink-0 text-destructive" />
                  <span className="flex-1">That didn't go through.</span>
                  <Button variant="outline" size="xs" onClick={() => regenerate()} disabled={offline}>
                    Try again
                  </Button>
                </div>
              )}
            </div>
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <p role="status" className="sr-only">
          {announcement}
        </p>

        <div className="space-y-2 p-3">
          {(connection.showProblem || queued) && (
            // Says what still works: the nudges come over plain HTTP, so they
            // keep updating while the chat socket is down.
            <div
              role="status"
              className="flex items-center gap-2 px-1 text-xs text-muted-foreground"
            >
              {connection.state === "failed" ? (
                <WifiOff className="size-3.5 shrink-0 text-warning" />
              ) : (
                <Spinner size="sm" />
              )}
              <span className="flex-1">
                {connection.state === "failed"
                  ? "Can't reach the Assistant. Your message stays here until it's back."
                  : queued
                    ? "Sends as soon as the Assistant connects…"
                    : "Reconnecting to the Assistant…"}
              </span>
              {connection.state === "failed" && (
                <Button variant="outline" size="xs" onClick={connection.retry}>
                  Retry
                </Button>
              )}
            </div>
          )}
          <PromptInput
            textareaRef={promptRef}
            value={input}
            onChange={(v) => {
              setInput(v);
              if (!v.trim()) setQueued(false);
            }}
            onSubmit={send}
            onStop={() => stop()}
            busy={busy}
            status={status}
            offline={offline}
            // Only once the drop has lasted — a first connect shouldn't flash it.
            placeholder={connection.showProblem ? "Waiting for the connection…" : undefined}
            onRecall={() => lastUserText}
          />
        </div>
      </SheetContent>
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear this conversation?"
        description="The messages are removed for good. What the Assistant remembers about you stays — you can review it in Settings → Tracking."
        confirmLabel="Clear chat"
        onConfirm={() => clearHistory()}
      />
    </Sheet>
  );
}
