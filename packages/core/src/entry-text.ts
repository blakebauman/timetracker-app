// Shared by the worker (what the Assistant's logTimeEntry saves) and the
// Assistant's approval card (what it shows before you approve), so the card
// never promises a description the server then drops.

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const FILLER = new Set(["my", "the", "a", "an", "project", "for", "to", "on", "work"]);

/**
 * The description, unless it only restates the project. Asked to "log 1 hour
 * to my cx coworker 365 project", the model wrote "cx coworker 365" as the
 * description of an entry on "CX Coworker for Microsoft 365 Copilot" — a line
 * that says nothing on an invoice — despite the prompt asking it not to.
 */
export function workDescription(description: string, projectNames: Array<string | null | undefined>): string {
  const own = words(description).filter((w) => !FILLER.has(w));
  if (!own.length) return "";
  const project = new Set(projectNames.flatMap((n) => (n ? words(n) : [])));
  return own.every((w) => project.has(w)) ? "" : description.trim();
}
