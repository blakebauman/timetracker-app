import { useEffect, useState } from "react";
import { parseQuickAdd } from "@timetracker/core/quick-add";
import { describeRecurRule } from "@timetracker/core/task-recurrence";

interface Project {
  id: string;
  name: string;
  color: string | null;
}

const PRIORITY_LABEL: Record<number, string> = { 1: "urgent", 2: "high", 3: "normal", 4: "none" };
const WEEKDAY = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** "today" / "tomorrow" / "friday" / "12 oct" — enough for an echo line. */
function describeDue(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1 && days < 7) return WEEKDAY[due.getDay()];
  return due.toLocaleDateString(undefined, { day: "numeric", month: "short" }).toLowerCase();
}

/** 900 → "15:00" (the popup has no time-format preference; 24-hour is unambiguous). */
function describeMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function describeEstimate(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

/**
 * Capture a task without leaving the page you're on.
 *
 * The line is read by the same `parseQuickAdd` as the web app's capture field
 * (`@timetracker/core/quick-add`), so "draft report fri p1 ~2h" files the same
 * task in both places. The last project used is remembered, because the popup
 * is opened for one quick thought at a time and re-picking a project every
 * time would make it slower than switching tabs.
 */
export function TaskCapture() {
  const [line, setLine] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_PROJECTS" }, (res) => {
      if (!res?.ok) return;
      const list = res.projects as Project[];
      setProjects(list);
      chrome.storage.local.get("taskProjectId", ({ taskProjectId }) => {
        const remembered = list.find((p) => p.id === taskProjectId);
        setProjectId(remembered?.id ?? (list.length === 1 ? list[0].id : null));
      });
    });
  }, []);

  const parsed = parseQuickAdd(line);
  const hinted = parsed.projectHint
    ? projects.find((p) => p.name.toLowerCase().replace(/\s+/g, "-").startsWith(parsed.projectHint!))
    : undefined;
  const effectiveProjectId = hinted?.id ?? projectId;
  const canSubmit = parsed.name.length > 0 && !!effectiveProjectId && !saving;

  const submit = () => {
    if (!canSubmit || !effectiveProjectId) return;
    setSaving(true);
    setNotice(null);
    const name = parsed.name;
    chrome.runtime.sendMessage(
      {
        type: "CREATE_TASK",
        task: {
          name,
          projectId: effectiveProjectId,
          ...(parsed.dueDate ? { dueDate: parsed.dueDate } : {}),
          ...(parsed.priority ? { priority: parsed.priority } : {}),
          ...(parsed.estimatedSeconds ? { estimatedSeconds: parsed.estimatedSeconds } : {}),
          ...(parsed.scheduledMinute !== null ? { scheduledMinute: parsed.scheduledMinute } : {}),
          ...(parsed.deadlineDate ? { deadlineDate: parsed.deadlineDate } : {}),
          ...(parsed.tagHints.length ? { tags: parsed.tagHints } : {}),
          ...(parsed.recurRule ? { recurRule: parsed.recurRule } : {}),
        },
      },
      (res) => {
        setSaving(false);
        if (!res?.ok) {
          // Keep the line: the whole point of capture is not losing it.
          setNotice({ tone: "error", text: res?.error ?? "Couldn't add the task" });
          return;
        }
        const project = projects.find((p) => p.id === effectiveProjectId);
        setLine("");
        setNotice({ tone: "ok", text: `Added “${name}”${project ? ` to ${project.name}` : ""}` });
        chrome.storage.local.set({ taskProjectId: effectiveProjectId });
      }
    );
  };

  const echo = [
    parsed.dueDate
      ? `due ${describeDue(parsed.dueDate)}${
          parsed.scheduledMinute !== null ? ` at ${describeMinute(parsed.scheduledMinute)}` : ""
        }`
      : null,
    parsed.deadlineDate ? `deadline ${describeDue(parsed.deadlineDate)}` : null,
    parsed.priority ? `priority ${PRIORITY_LABEL[parsed.priority]}` : null,
    parsed.estimatedSeconds ? `estimate ${describeEstimate(parsed.estimatedSeconds)}` : null,
    parsed.recurRule ? describeRecurRule(parsed.recurRule)?.toLowerCase() : null,
    hinted ? hinted.name : null,
    ...parsed.tagHints.map((t) => `@${t}`),
  ].filter(Boolean);

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    border: "1px dashed var(--input-border)",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 13,
    outline: "none",
    background: "var(--bg)",
    color: "var(--fg)",
  };
  const micro: React.CSSProperties = { fontSize: 11, color: "var(--fg-muted)", margin: "4px 4px 0" };

  return (
    <div style={{ padding: "10px 14px 12px", borderTop: "1px solid var(--border)" }}>
      <input
        value={line}
        onChange={(e) => {
          setLine(e.target.value);
          setNotice(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Add a task — try “draft report fri p1”"
        aria-label="Add a task"
        style={fieldStyle}
      />
      {!hinted && projects.length > 1 && (
        <select
          value={projectId ?? ""}
          onChange={(e) => setProjectId(e.target.value || null)}
          aria-label="Task project"
          style={{ ...fieldStyle, border: "1px solid var(--input-border)", marginTop: 6, padding: "4px 10px", fontSize: 12 }}
        >
          <option value="">Choose a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      {line.trim() && echo.length > 0 && (
        <p style={micro}>{[`“${parsed.name}”`, ...echo].join(" · ")}</p>
      )}
      {line.trim() && !effectiveProjectId && (
        <p style={micro}>
          {projects.length === 0 ? "Create a project in the app first — tasks belong to one." : "Choose a project to add this task."}
        </p>
      )}
      {notice && (
        <p style={{ ...micro, color: notice.tone === "error" ? "var(--brand)" : "var(--fg-muted)" }} role="status">
          {notice.text}
        </p>
      )}
    </div>
  );
}
