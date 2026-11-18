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
import { useQueryClient } from "@tanstack/react-query";
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
import type { AssistantNudge, DayOff, Settings } from "@timetracker/core/schemas";
import { format } from "date-fns";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace";
import { SuggestionChips } from "./ai-elements/SuggestionChips";
import { ToolCard } from "./ai-elements/ToolCard";
import { AssistantMarkdown } from "./ai-elements/AssistantMarkdown";
import { MessageActions } from "./ai-elements/MessageActions";
import { useAgentConnection, useSlowReply } from "./useAgentConnection";
import { PromptInput } from "./ai-elements/PromptInput";

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

  const action =
    nudge.kind === "deadline_risk" || nudge.kind === "tasks_overdue" ? (
      // Task nudges point at the list that fixes them; the panel closes so the
      // list isn't hidden behind it.
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          navigate("/tasks", { state: { groupBy: "due" } });
          setAssistantOpen(false);
        }}
      >
        Open tasks
      </Button>
    ) : nudge.kind === "untracked_meeting" ? (
      <Button variant="outline" size="sm" onClick={trackEvent} disabled={trackNudgeEvent.isPending}>
        {trackNudgeEvent.isPending ? "Adding…" : "Add to timesheet"}
      </Button>
    ) : nudge.kind === "long_timer" ? (
      <Button variant="outline" size="sm" onClick={stopFromNudge}>
        Stop timer
      </Button>
    ) : nudge.kind === "meeting_now" ? (
      <Button variant="outline" size="sm" onClick={startFromEvent}>
        Start timer
      </Button>
    ) : null;

  // An Item, like the Assistant's own result rows and approvals: one row
  // grammar for everything in the panel that isn't the conversation's prose.
  return (
    <Item variant="outline" size="sm" className="flex-nowrap items-start gap-2.5 rounded-container bg-card p-3">
      <ItemMedia className="pt-0.5">
        <Icon className="size-4 text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle className="line-clamp-none w-full">{nudge.title}</ItemTitle>
        <ItemDescription className="line-clamp-none text-xs">{nudge.body}</ItemDescription>
        {action && <div className="mt-1.5">{action}</div>}
      </ItemContent>
      <ItemActions className="-mt-0.5 -mr-1 self-start">
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={() => dismissNudge(nudge.id)}
          // Named for its nudge: two "Dismiss nudge" buttons in a screen
          // reader's list couldn't be told apart.
          aria-label={`Dismiss: ${nudge.title}`}
          title="Dismiss"
        >
          <X />
        </Button>
      </ItemActions>
    </Item>
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
  streaming,
  onApprove,
  onRegenerate,
}: {
  message: UIMessage;
  canRegenerate: boolean;
  /** This is the turn being written right now. */
  streaming: boolean;
  onApprove: (id: string, approved: boolean) => void;
  onRegenerate: () => void;
}) {
  // AI Elements' Message: the user's turn is a muted Bubble at the end of the
  // line, recessed with a hairline; the Assistant's turn is unbubbled prose on
  // the sheet, so a reply carrying rows and a day plan gets the panel's whole
  // measure. Neither carries the brand red — that's for the Send disc.
  if (m.role === "user") {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble align="end" variant="muted" className="max-w-[85%]">
            <BubbleContent className="rounded-container border-border px-3 py-2 whitespace-pre-wrap wrap-anywhere">
              {textOf(m)}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }
  return (
    // `group` drives the footer's tt-reveal (the primitive's group is named).
    <Message className="group">
      <MessageContent className="gap-3">
        {groupParts(m.parts).map((group, gi) =>
          group.kind === "text" ? (
            <AssistantMarkdown key={gi} text={group.text} />
          ) : group.kind === "approval" ? (
            <ToolCard key={gi} part={group.part} live={streaming} onApprove={onApprove} />
          ) : (
            // A run of tool calls is one trace: the steps the Assistant took.
            <Trace key={gi} className="gap-2.5">
              {group.parts.map((part, i) => (
                <ToolCard key={i} part={part} live={streaming} onApprove={onApprove} />
              ))}
            </Trace>
          )
        )}
        {/* Copy / Regenerate sit in the footer, under the reply: they follow
            the prose rather than a card edge, and are revealed on hover or
            focus of the turn (always shown under a touch pointer). */}
        {textOf(m) && (
          // Pulled up into the turn's gap: the footer is hidden until hover
          // on a fine pointer, and at full height it left a dead band under
          // every reply.
          <MessageFooter className="-mt-2 -mb-2 px-0">
            <MessageActions message={m} canRegenerate={canRegenerate} onRegenerate={onRegenerate} />
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  );
});

type Part = UIMessage["parts"][number];
type PartGroup =
  | { kind: "text"; text: string }
  | { kind: "steps"; parts: Part[] }
  | { kind: "approval"; part: Part };

const isToolPart = (p: Part) => typeof p.type === "string" && p.type.startsWith("tool-");

/**
 * The reply in reading order: text, runs of tool calls (one Trace each), and
 * approvals — which break a run, because a question for the person sits
 * outside the trace of what the Assistant did (AI Elements' Confirmation).
 */
function groupParts(parts: Part[]): PartGroup[] {
  const groups: PartGroup[] = [];
  for (const p of parts) {
    if (p.type === "text") {
      if (p.text.trim()) groups.push({ kind: "text", text: p.text });
    } else if (isToolPart(p)) {
      // Asking for the person's OK: a question, not a step, so outside the trace.
      if (getToolPartState(p) === "waiting-approval") {
        groups.push({ kind: "approval", part: p });
      } else {
        const last = groups[groups.length - 1];
        if (last?.kind === "steps") last.parts.push(p);
        else groups.push({ kind: "steps", parts: [p] });
      }
    }
  }
  return groups;
}

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
  const queryClient = useQueryClient();
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
    body: () => {
      // The agent is one per workspace and can't tell which member is typing,
      // so their working hours (where planDay may place tasks) and whether
      // they have today off ride along.
      const settings = queryClient.getQueryData<Settings>(["settings"]);
      const today = format(new Date(), "yyyy-MM-dd");
      const dayOff = queryClient
        .getQueriesData<DayOff[]>({ queryKey: ["days-off"] })
        .flatMap(([, rows]) => rows ?? [])
        .find((d) => d.date === today)?.portion;
      return {
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        workdayStartMinute: settings?.workdayStartMinute,
        workdayEndMinute: settings?.workdayEndMinute,
        dayOff,
      };
    },
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

        {/* Follows the end while you're at it. Off (the default), the opening
            position was taken before the tool rows had their data and the
            fence its highlighting, and the newest turn — with an approval
            waiting in it — was left below the fold as they grew. Scrolling up
            to read still holds your place; the person's question stays the
            scroll anchor (MessageScrollerItem below). */}
        <MessageScrollerProvider autoScroll>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport aria-label="Conversation with the Assistant">
              {/* Live announcements are off: the content is a log, and a log
                  reads every streamed token out. The finished turn is
                  announced once by the status line below the scroller. */}
              <MessageScrollerContent aria-live="off" aria-busy={busy} className="gap-6 p-4">
                {/* What needs your attention */}
                <MessageScrollerItem>
                  <section aria-label="Needs your attention" className="flex flex-col gap-2">
                    {nudgesLoading ? (
                      <Skeleton className="h-16 w-full" />
                    ) : nudgesError ? (
                      // "All caught up" on a failed fetch would be the one thing
                      // the Assistant must never say; name the problem instead.
                      <Item variant="outline" size="sm" className="flex-nowrap gap-2.5 rounded-container bg-card p-3">
                        <ItemMedia>
                          <AlertCircle className="size-4 text-muted-foreground" />
                        </ItemMedia>
                        <ItemContent>
                          <ItemDescription className="text-sm">Couldn't check your calendar and timesheet.</ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <Button variant="outline" size="xs" onClick={() => refetchNudges()}>
                            Retry
                          </Button>
                        </ItemActions>
                      </Item>
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
                </MessageScrollerItem>

                {!hasConversation && (
                  <MessageScrollerItem>
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-muted-foreground">
                        Ask about your time, or have me log it, start and stop timers, add and tick off
                        tasks, or plan your day. Anything that changes your timesheet or plan waits for
                        your OK.
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
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
                  </MessageScrollerItem>
                )}

                {/* The person's turn is the scroll anchor: a new question
                    settles near the top and the reply streams in under it,
                    instead of the thread chasing every token to the bottom. */}
                {messages.map((m) => (
                  <MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={m.role === "user"}>
                    <MessageItem
                      message={m}
                      canRegenerate={m.id === lastAssistantId && !busy}
                      streaming={busy && m.id === tail?.id}
                      onApprove={approve}
                      onRegenerate={regenerateLast}
                    />
                  </MessageScrollerItem>
                ))}

                {(showThinking || failed) && (
                  <MessageScrollerItem>
                    {failed ? (
                      // A failed turn used to end in silence — the spinner just
                      // went away. Say so, and offer the same retry the message
                      // menu has.
                      <Item variant="outline" size="sm" className="flex-nowrap gap-2.5 rounded-container border-destructive/40 bg-card px-3 py-2">
                        <ItemMedia>
                          <AlertCircle className="size-4 text-destructive" />
                        </ItemMedia>
                        <ItemContent>
                          <ItemTitle className="font-normal">That didn't go through.</ItemTitle>
                        </ItemContent>
                        <ItemActions>
                          <Button variant="outline" size="xs" onClick={() => regenerate()} disabled={offline}>
                            Try again
                          </Button>
                        </ItemActions>
                      </Item>
                    ) : stuck ? (
                      <Item role="status" variant="outline" size="sm" className="flex-nowrap gap-2.5 rounded-container bg-card px-3 py-2">
                        <ItemMedia>
                          <AlertCircle className="size-4 text-warning" />
                        </ItemMedia>
                        <ItemContent>
                          <ItemTitle className="font-normal">No reply yet.</ItemTitle>
                        </ItemContent>
                        <ItemActions>
                          <Button variant="outline" size="xs" onClick={retryStuck} disabled={offline}>
                            Try again
                          </Button>
                        </ItemActions>
                      </Item>
                    ) : (
                      // The model streams no reasoning parts, so "Thinking" is
                      // the one running step it has: a trace line, shimmering.
                      <Trace role="status">
                        <TraceLine status="running">
                          <TraceIcon>
                            <Sparkles />
                          </TraceIcon>
                          <TraceTitle>Thinking…</TraceTitle>
                        </TraceLine>
                      </Trace>
                    )}
                  </MessageScrollerItem>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton aria-label="Scroll to latest" title="Scroll to latest" />
          </MessageScroller>
        </MessageScrollerProvider>
        <p role="status" className="sr-only">
          {announcement}
        </p>

        <div className="flex flex-col gap-2 p-3">
          {!hasConversation && (
            <SuggestionChips suggestions={suggestions} onSelect={send} disabled={busy} />
          )}
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
