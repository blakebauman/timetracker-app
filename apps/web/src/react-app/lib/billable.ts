// Settings → Preferences → "Default billable" is device-local (a legacy `pref_*`
// key, unlike the server-backed display prefs in uiStore). It was written by the
// settings switch and read by nothing at all: the toggle was inert, and the user
// guide documented a preference that had no effect on a single entry.
//
// Reading it needs a guard, not a bare `localStorage.getItem` — a private window
// with site data blocked throws on access rather than returning null, and a
// preference is never worth failing a render over.
const KEY = "pref_defaultBillable";

export function getDefaultBillable(): boolean {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

export function setDefaultBillable(value: boolean): void {
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    // Preference is best-effort; the session still works without it persisting.
  }
}
