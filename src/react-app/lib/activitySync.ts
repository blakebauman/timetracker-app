// Cross-session activity sync for idle detection.
//
// Each open session (tab, PWA window, other device) reports local user
// activity over the workspace WebSocket; TimerRoomDO relays it to the same
// user's other sockets as a `user_activity` event. We remember when we last
// heard one — stamped with the local clock at receive time, so sender clock
// skew never matters — and idle detection treats it like local activity.

export const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
] as const;

let lastRemoteActivity = 0;

export function recordRemoteActivity(): void {
  lastRemoteActivity = Date.now();
}

export function getLastRemoteActivity(): number {
  return lastRemoteActivity;
}
