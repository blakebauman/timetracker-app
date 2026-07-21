import { Heading, Section, Text } from "react-email";
import { EmailLayout } from "./layout";
import { bodyTextStyle, colors, fontMono, headingStyle } from "./theme";

export function VerificationOtpEmail({ otp }: { otp: string }) {
  return (
    <EmailLayout preview={`Your verification code is ${otp}`}>
      <Heading as="h1" style={headingStyle}>
        Your verification code
      </Heading>
      <Text style={bodyTextStyle}>Enter this code to continue signing in.</Text>
      <Section
        style={{
          backgroundColor: colors.canvas,
          border: `1px solid ${colors.border}`,
          borderRadius: "8px",
          padding: "16px 0",
          textAlign: "center",
        }}
      >
        {/* Plain text (not an image) so the code stays selectable/copyable everywhere */}
        <Text
          style={{
            color: colors.ink,
            fontFamily: fontMono,
            fontSize: "32px",
            fontWeight: 600,
            letterSpacing: "8px",
            margin: 0,
          }}
        >
          {otp}
        </Text>
      </Section>
      <Text style={{ color: colors.mutedInk, fontSize: "12px", margin: "16px 0 0" }}>
        This code expires in 5 minutes.
      </Text>
    </EmailLayout>
  );
}

VerificationOtpEmail.PreviewProps = { otp: "123456" };

export default VerificationOtpEmail;
