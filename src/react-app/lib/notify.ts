// Thin wrapper around the Web Notifications API used by the productivity hooks
// (idle nudges, "you're not tracking" reminders, pomodoro boundaries).

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function canNotify(): boolean {
  return notificationsSupported() && Notification.permission === "granted";
}

/** Ask for permission if not already decided. Returns true when granted. */
export async function requestNotifyPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Fire a notification if permission is granted; no-op otherwise. */
export function notify(title: string, body?: string): void {
  if (!canNotify()) return;
  try {
    new Notification(title, { body, icon: "/favicon.ico", tag: "timetracker" });
  } catch {
    // Some browsers throw when constructing Notifications outside a user gesture.
  }
}
