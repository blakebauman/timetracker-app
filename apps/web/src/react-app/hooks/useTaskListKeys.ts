import { useHotkeys } from "react-hotkeys-hook";
import { useCompleteTask, useDeleteTask, useUpdateTask } from "@/hooks/useTasks";
import { useTimer } from "@/hooks/useTimer";
import { useTimerStore } from "@/stores/timerStore";
import type { Task } from "@timetracker/core/schemas";

/** Rows opt in with this attribute (and `tabIndex={-1}`), carrying their task id. */
export const TASK_ROW_ATTR = "data-task-row";

function rows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${TASK_ROW_ATTR}]`));
}

/** The row holding focus — the row itself, or any control inside it. */
function focusedRow(): HTMLElement | null {
  return (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(`[${TASK_ROW_ATTR}]`) ?? null;
}

/**
 * A dialog, menu or popover owns the keyboard while it's open. Its buttons
 * aren't form fields, so react-hotkeys-hook's own input guard lets them through
 * — pressing "e" on a menu item would otherwise open the edit dialog behind it.
 */
function overlayOpen(): boolean {
  return !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]'
  );
}

/** Where focus goes after the focused row leaves the list (done, deleted). */
function neighbourOf(row: HTMLElement): HTMLElement | null {
  const all = rows();
  const i = all.indexOf(row);
  return all[i + 1] ?? all[i - 1] ?? null;
}

interface Options {
  tasks: Task[];
  onEdit: (task: Task) => void;
  /** Focus the page's capture field. */
  onCapture: () => void;
}

/**
 * Keyboard control of the task list: move with J/K (or the arrows, once a row
 * has focus), then act on the focused row.
 *
 * The cursor is real DOM focus rather than a highlighted index in state, so it
 * survives re-renders by construction, shows the house focus ring, and Tab and
 * a screen reader agree with it. Plain letter keys never fire inside a field —
 * that's react-hotkeys-hook's default, and why none of these needs a modifier.
 */
export function useTaskListKeys({ tasks, onEdit, onCapture }: Options) {
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const { startTimer, stopTimer } = useTimer();

  const taskOf = (row: HTMLElement | null) =>
    row ? tasks.find((t) => t.id === row.getAttribute(TASK_ROW_ATTR)) : undefined;

  const move = (delta: 1 | -1) => {
    const all = rows();
    if (!all.length) return;
    const current = focusedRow();
    const i = current ? all.indexOf(current) : -1;
    const next = i === -1 ? (delta === 1 ? all[0] : all[all.length - 1]) : all[i + delta];
    next?.focus();
    next?.scrollIntoView({ block: "nearest" });
  };

  /** Run `act` on the focused row's task; `leaves` = the row will disappear. */
  const onFocused = (act: (task: Task) => void, leaves = false) => (e: KeyboardEvent) => {
    if (overlayOpen()) return;
    const row = focusedRow();
    const task = taskOf(row);
    if (!row || !task) return;
    e.preventDefault();
    const after = leaves ? neighbourOf(row) : null;
    act(task);
    // After the act, on the next frame, so a row that re-rendered in place
    // (priority, reopen) isn't the one we move to.
    if (after) requestAnimationFrame(() => after.focus());
  };

  useHotkeys("j", (e) => { if (!overlayOpen()) { e.preventDefault(); move(1); } });
  useHotkeys("k", (e) => { if (!overlayOpen()) { e.preventDefault(); move(-1); } });
  // Arrows only once the list has focus: on the bare page they scroll it.
  useHotkeys("down", (e) => { if (focusedRow() && !overlayOpen()) { e.preventDefault(); move(1); } });
  useHotkeys("up", (e) => { if (focusedRow() && !overlayOpen()) { e.preventDefault(); move(-1); } });

  // Completing in Today/Upcoming moves the row to another group or out of the
  // view, so focus steps to its neighbour; reopening in place keeps it.
  useHotkeys("x", onFocused((t) => completeTask(t, t.active), true), [tasks]);
  useHotkeys("e", onFocused((t) => onEdit(t)), [tasks, onEdit]);
  useHotkeys(
    "1,2,3,4",
    (e, handler) => {
      const priority = Number(handler.keys?.[0]);
      onFocused((t) => {
        if (t.priority !== priority) updateTask.mutate({ id: t.id, data: { priority } });
      })(e);
    },
    [tasks]
  );
  useHotkeys(
    "s",
    onFocused((t) => {
      const running = useTimerStore.getState().runningEntry;
      if (running?.taskId === t.id) stopTimer();
      else if (t.active) startTimer({ description: t.name, projectId: t.projectId, taskId: t.id });
    }),
    [tasks]
  );
  useHotkeys("delete,backspace", onFocused((t) => deleteTask(t), true), [tasks]);
  useHotkeys(
    "q",
    (e) => {
      if (overlayOpen()) return;
      e.preventDefault();
      onCapture();
    },
    [onCapture]
  );
}
