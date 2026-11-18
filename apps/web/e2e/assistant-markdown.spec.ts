import { test, expect } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantMarkdown } from "../src/react-app/components/assistant/ai-elements/AssistantMarkdown";

// The Assistant's markdown is a tiny hand-rolled renderer; a fence is an AI
// Elements CodeBlock whose highlighting loads on the client (an effect), so a
// static render shows the plain lines. Pure rendering, exercised directly.
const render = (text: string) => renderToStaticMarkup(createElement(AssistantMarkdown, { text }));

test("a ``` fence is one scrollable, keyboard-reachable block, not literal backticks", () => {
  const html = render("Here it is:\n```sql\nSELECT 1;\n  -- indented\n```\nDone.");
  expect(html).not.toContain("```");
  // One block, in the tab order, each source line one line — indentation kept.
  expect(html).toMatch(/<pre[^>]*tabindex="0"/);
  const lines = [...html.matchAll(/data-slot="code-block-line-content"[^>]*>([^<]*)</g)].map((m) => m[1]);
  expect(lines).toEqual(["SELECT 1;", "  -- indented"]);
  expect(html).toContain("<p class=\"whitespace-pre-wrap\">Here it is:</p>");
  expect(html).toContain("<p class=\"whitespace-pre-wrap\">Done.</p>");
});

test("a fence still open mid-stream renders as a block already", () => {
  expect(render("```\nSELECT")).toMatch(/<pre[^>]*>.*data-slot="code-block-line-content"[^>]*>SELECT</);
});

test("long unbroken text can break anywhere instead of running past the card", () => {
  expect(render("https://example.com/" + "a".repeat(120))).toMatch(/^<div class="[^"]*\bwrap-anywhere\b/);
});
