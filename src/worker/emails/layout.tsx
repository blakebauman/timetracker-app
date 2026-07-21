import { Body, Container, Head, Hr, Html, Link, Preview, Text } from "react-email";
import type { ReactNode } from "react";
import { colors, fontSans } from "./theme";

export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.canvas, fontFamily: fontSans, margin: 0, padding: "24px 12px" }}>
        <Container
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: "12px",
            maxWidth: "440px",
            padding: "32px",
          }}
        >
          <Text style={{ color: colors.ink, fontSize: "15px", fontWeight: 600, margin: "0 0 24px" }}>
            timetracker.run
          </Text>
          {children}
          {/* Override the borderTop key itself — Hr's default `border-top: 1px solid #eaeaea`
              is a shorthand that beats a plain borderColor in CSS declaration order. */}
          <Hr style={{ borderTop: `1px solid ${colors.border}`, margin: "28px 0 16px" }} />
          <Text style={{ color: colors.mutedInk, fontSize: "12px", lineHeight: "1.5", margin: 0 }}>
            Sent by{" "}
            <Link href="https://timetracker.run" style={{ color: colors.mutedInk, textDecoration: "underline" }}>
              timetracker.run
            </Link>
            . If you didn&apos;t expect this email, you can safely ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
