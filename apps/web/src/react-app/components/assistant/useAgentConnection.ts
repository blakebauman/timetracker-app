import { useEffect, useEffectEvent, useState } from "react";

/** The socket half of `useAgent`'s return — PartySocket is an EventTarget with a readyState. */
interface AgentSocket {
  readyState: number;
  addEventListener: (type: "open" | "close" | "error", listener: () => void) => void;
  removeEventListener: (type: "open" | "close" | "error", listener: () => void) => void;
  connectionError: unknown;
  reconnect: () => void;
}

export type AgentConnection = "connecting" | "open" | "lost" | "failed";

// A first connect takes a beat; saying "Reconnecting…" for it would flash a
// warning on every open of the panel. Only a socket that stays down past this
// is worth telling anyone about.
const GRACE_MS = 2_000;

/**
 * Whether the chat can hear you. `useAgentChat` only surfaces a failed turn,
 * not a dead socket: a message sent while `/agents/*` was down showed the
 * user's bubble and then nothing, forever — for a product whose promise is
 * "never wonder whether it's tracking", the one state that must not be silent.
 */
export function useAgentConnection(
  agent: AgentSocket,
  /** Runs each time the socket opens — e.g. to send a message queued while it was down. */
  onOpen?: () => void
): {
  state: AgentConnection;
  /** True once the socket has been down long enough to say so. */
  showProblem: boolean;
  retry: () => void;
} {
  const [readyState, setReadyState] = useState(agent.readyState);
  const [showProblem, setShowProblem] = useState(false);
  const opened = useEffectEvent(() => onOpen?.());

  useEffect(() => {
    const sync = () => {
      setReadyState(agent.readyState);
      if (agent.readyState === WebSocket.OPEN) setShowProblem(false);
    };
    const handleOpen = () => {
      sync();
      opened();
    };
    sync();
    agent.addEventListener("open", handleOpen);
    agent.addEventListener("close", sync);
    agent.addEventListener("error", sync);
    return () => {
      agent.removeEventListener("open", handleOpen);
      agent.removeEventListener("close", sync);
      agent.removeEventListener("error", sync);
    };
  }, [agent]);

  const open = readyState === WebSocket.OPEN;
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => setShowProblem(true), GRACE_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  const state: AgentConnection = open
    ? "open"
    : agent.connectionError
      ? "failed"
      : readyState === WebSocket.CONNECTING
        ? "connecting"
        : "lost";

  return { state, showProblem: showProblem && !open, retry: () => agent.reconnect() };
}

// Workers AI's first token normally lands in a few seconds; a turn with
// nothing back after this long is stuck, not slow.
const SLOW_MS = 20_000;

/**
 * True when a turn has been waiting for its first word for longer than it
 * should. `turn` identifies the wait — bump it on a retry so a fresh attempt
 * gets a fresh allowance.
 */
export function useSlowReply(waiting: boolean, turn: string): boolean {
  const [slowTurn, setSlowTurn] = useState<string | null>(null);
  useEffect(() => {
    if (!waiting) return;
    const t = window.setTimeout(() => setSlowTurn(turn), SLOW_MS);
    return () => window.clearTimeout(t);
  }, [waiting, turn]);
  return waiting && slowTurn === turn;
}
