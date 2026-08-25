import { Button, Heading, Hr, Section, Text } from "react-email";
import { EmailLayout } from "./layout";
import { bodyTextStyle, buttonStyle, colors, headingStyle } from "./theme";

export interface BriefProjectLine {
  name: string;
  color: string;
  seconds: number;
}

export interface BriefBudgetLine {
  name: string;
  /** Already-formatted verdict, e.g. "on pace to overrun by 14h". */
  verdict: string;
  over: boolean;
}

export interface DailyBriefEmailProps {
  /** Built by the sender, where the recipient's timezone is known. */
  greeting: string;
  /** "Yesterday · Monday, Aug 24" or "Last week · Aug 17 – 23". */
  periodLabel: string;
  totalLabel: string;
  billableLabel: string | null;
  entryCount: number;
  projects: BriefProjectLine[];
  budgets: BriefBudgetLine[];
  draftsWaiting: number;
  /** One AI-written paragraph. Absent when the model was unavailable. */
  narrative: string | null;
  appUrl: string;
}

function formatSeconds(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * The morning briefing: what yesterday (or last week) actually held, what is
 * waiting to be reviewed, and which budgets need attention.
 *
 * Every number here is computed deterministically. The one AI-written element
 * is the narrative paragraph, and it is omitted entirely rather than replaced
 * with filler when the model isn't available — an email that pads itself is one
 * people stop opening.
 */
export function DailyBriefEmail({
  greeting,
  periodLabel,
  totalLabel,
  billableLabel,
  entryCount,
  projects,
  budgets,
  draftsWaiting,
  narrative,
  appUrl,
}: DailyBriefEmailProps) {
  const total = projects.reduce((sum, p) => sum + p.seconds, 0);

  return (
    <EmailLayout preview={`${periodLabel} — ${totalLabel} tracked`}>
      <Heading as="h1" style={headingStyle}>
        {greeting}
      </Heading>
      <Text style={{ ...bodyTextStyle, margin: "0 0 24px" }}>{periodLabel}</Text>

      <Section style={{ marginBottom: "24px" }}>
        <Text
          style={{
            color: colors.ink,
            fontSize: "32px",
            fontWeight: 600,
            lineHeight: "1.1",
            margin: "0 0 4px",
          }}
        >
          {totalLabel}
        </Text>
        <Text style={{ color: colors.mutedInk, fontSize: "13px", margin: 0 }}>
          across {entryCount} {entryCount === 1 ? "entry" : "entries"}
          {billableLabel ? ` · ${billableLabel} billable` : ""}
        </Text>
      </Section>

      {projects.length > 0 && (
        <Section style={{ marginBottom: "24px" }}>
          {projects.map((p) => (
            <table
              key={p.name}
              width="100%"
              cellPadding={0}
              cellSpacing={0}
              style={{ marginBottom: "8px" }}
            >
              <tbody>
                <tr>
                  <td width="10" valign="middle">
                    {/* A bare div can't be relied on to keep its size across
                        clients; a fixed-width cell with a background can. */}
                    <div
                      style={{
                        backgroundColor: p.color,
                        borderRadius: "3px",
                        height: "10px",
                        width: "10px",
                      }}
                    />
                  </td>
                  <td style={{ paddingLeft: "8px" }}>
                    <Text
                      style={{ color: colors.ink, fontSize: "13px", margin: 0 }}
                    >
                      {p.name}
                    </Text>
                  </td>
                  <td align="right" width="80">
                    <Text
                      style={{
                        color: colors.mutedInk,
                        fontSize: "13px",
                        margin: 0,
                      }}
                    >
                      {formatSeconds(p.seconds)}
                      {total > 0 ? ` · ${Math.round((p.seconds / total) * 100)}%` : ""}
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>
          ))}
        </Section>
      )}

      {narrative && (
        <>
          <Hr style={{ borderTop: `1px solid ${colors.border}`, margin: "0 0 20px" }} />
          <Text style={{ ...bodyTextStyle, color: colors.mutedInk }}>{narrative}</Text>
        </>
      )}

      {budgets.length > 0 && (
        <Section style={{ marginBottom: "20px" }}>
          <Text
            style={{
              color: colors.ink,
              fontSize: "13px",
              fontWeight: 600,
              margin: "0 0 8px",
            }}
          >
            Budgets worth a look
          </Text>
          {budgets.map((b) => (
            <Text
              key={b.name}
              style={{
                color: b.over ? colors.primaryInk : colors.mutedInk,
                fontSize: "13px",
                lineHeight: "1.5",
                margin: "0 0 4px",
              }}
            >
              {b.name} — {b.verdict}
            </Text>
          ))}
        </Section>
      )}

      {draftsWaiting > 0 && (
        <Text style={{ ...bodyTextStyle, margin: "0 0 20px" }}>
          {draftsWaiting} drafted {draftsWaiting === 1 ? "entry is" : "entries are"}{" "}
          waiting for review.
        </Text>
      )}

      <Button href={appUrl} style={buttonStyle}>
        {draftsWaiting > 0 ? "Review your time" : "Open your timesheet"}
      </Button>
    </EmailLayout>
  );
}

DailyBriefEmail.PreviewProps = {
  greeting: "Good evening, Blake",
  periodLabel: "Yesterday · Monday, Aug 24",
  totalLabel: "6h 45m",
  billableLabel: "5h 15m",
  entryCount: 7,
  projects: [
    { name: "Website Redesign", color: "#dd322e", seconds: 3 * 3600 },
    { name: "API Development", color: "#2563eb", seconds: 2 * 3600 + 1800 },
    { name: "Internal Admin", color: "#16a34a", seconds: 4500 },
  ],
  budgets: [
    { name: "Website Redesign", verdict: "on pace to overrun by 14h", over: true },
    { name: "API Development", verdict: "at 88% of its 40h budget", over: false },
  ],
  draftsWaiting: 3,
  narrative:
    "Most of the day went to the homepage rebuild, with a scope call in the afternoon and a short pass over the client's feedback before close.",
  appUrl: "https://timetracker.run",
} satisfies DailyBriefEmailProps;

export default DailyBriefEmail;
