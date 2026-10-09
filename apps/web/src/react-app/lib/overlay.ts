/**
 * True while a dialog, menu, listbox or popover is open — the moments a bare
 * single-key shortcut must stand down, since the key belongs to the overlay
 * (a menu's typeahead, a picker's search) or the page behind it is inert.
 */
export function overlayOpen(): boolean {
  return !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]'
  );
}
