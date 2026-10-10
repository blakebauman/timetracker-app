import { Fragment, memo } from "react";

// Deliberately tiny markdown renderer — the assistant runs on Llama, which emits plain
// prose with the occasional list or **bold**. This avoids pulling in streamdown
// + shiki (heavy). Handles paragraphs, bullet lists, inline bold, inline `code`,
// and ``` fences — rare, but Llama does write one when asked, and unhandled the
// backticks rendered as literal lines around the text. No highlighting.

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Alternating split on **bold** and `code`.
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      nodes.push(
        <code key={`${keyPrefix}-c${i}`} className="rounded bg-muted px-1 py-0.5 text-xs">
          {token.slice(1, -1)}
        </code>
      );
    }
    last = m.index + token.length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Memoized on the text: only the reply being streamed re-parses per token.
export const AssistantMarkdown = memo(function AssistantMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: string) => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={key} className="list-disc space-y-0.5 pl-4">
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b, `${key}-${i}`)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  // Lines inside an open fence. A fence still open when the text ends (mid-
  // stream) renders as a block anyway, so the reply doesn't jump on its close.
  let code: string[] | null = null;
  const flushCode = (key: string) => {
    if (code === null) return;
    blocks.push(
      // Scrolls rather than wraps: a code line's breaks are its meaning. In the
      // tab order (and ringed) because a scroll region a keyboard can't reach
      // hides whatever is past its edge.
      <pre
        key={key}
        tabIndex={0}
        className="overflow-x-auto rounded-md border bg-background px-3 py-2 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <code>{code.join("\n")}</code>
      </pre>
    );
    code = null;
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      if (code === null) {
        flushBullets(`ul-${idx}`);
        code = [];
      } else {
        flushCode(`pre-${idx}`);
      }
      return;
    }
    if (code !== null) {
      code.push(line);
      return;
    }
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flushBullets(`ul-${idx}`);
    if (trimmed) {
      blocks.push(
        <p key={`p-${idx}`} className="whitespace-pre-wrap">
          {renderInline(trimmed, `p-${idx}`)}
        </p>
      );
    }
  });
  flushBullets("ul-end");
  flushCode("pre-end");

  // wrap-anywhere: a pasted URL or path has no break opportunity, and ran
  // past the card's edge, clipped.
  return <div className="space-y-2 text-sm leading-relaxed wrap-anywhere">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
});
