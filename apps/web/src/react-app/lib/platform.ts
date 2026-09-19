// Best-effort platform check so shortcut hints render ⌘ on macOS and Ctrl
// elsewhere. Shared by every surface that advertises a keyboard shortcut.
export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
export const modKey = isMac ? "⌘" : "Ctrl";
