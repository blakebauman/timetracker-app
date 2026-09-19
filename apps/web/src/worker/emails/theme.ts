import type { CSSProperties } from "react";

// Email-safe hex equivalents of the DESIGN.md oklch tokens ("The Quiet Ledger").
// Email clients don't support oklch(), so these are pre-converted; light-mode
// only — clients apply their own dark-mode inversion.
export const colors = {
  primary: "#dd322e", // brand red — the single accent, primary button fill only
  primaryInk: "#b71a1b", // brand red retuned for small text (links)
  canvas: "#f5f3f2", // muted — outer email background so the card reads as a surface
  surface: "#fefdfd", // card background
  ink: "#1d1a19", // body text
  mutedInk: "#6f6a68", // secondary text, footer
  border: "#e4e1e0",
};

// Geist isn't reliably loadable in email clients — fall back to the system stacks.
export const fontSans =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const fontMono =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

// Shared per-template styles (kept here rather than in layout.tsx so the .tsx
// files export only components, keeping react-refresh/only-export-components quiet).
export const headingStyle: CSSProperties = {
  color: colors.ink,
  fontSize: "20px",
  fontWeight: 600,
  lineHeight: "1.3",
  margin: "0 0 8px",
};

export const bodyTextStyle: CSSProperties = {
  color: colors.ink,
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "0 0 20px",
};

export const buttonStyle: CSSProperties = {
  backgroundColor: colors.primary,
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: 500,
  padding: "10px 16px",
};

export const fallbackLinkTextStyle: CSSProperties = {
  color: colors.mutedInk,
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "16px 0 0",
  wordBreak: "break-all",
};
