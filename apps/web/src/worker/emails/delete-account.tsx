import { Button, Heading, Link, Text } from "react-email";
import { EmailLayout } from "./layout";
import { bodyTextStyle, buttonStyle, colors, fallbackLinkTextStyle, headingStyle } from "./theme";

// Sent by Better Auth's `user.deleteUser.sendDeleteAccountVerification` (auth.ts).
// Passwords are retired in production, so this link IS the confirmation step:
// nothing is deleted until it is opened from a signed-in browser.
export function DeleteAccountEmail({ url }: { url: string }) {
  return (
    <EmailLayout preview="Confirm that you want to delete your timetracker.run account">
      <Heading as="h1" style={headingStyle}>
        Confirm account deletion
      </Heading>
      <Text style={bodyTextStyle}>
        Opening the link below permanently deletes your timetracker.run account and everything in your
        personal workspace. It only works while you are signed in, and it expires in 24 hours.
      </Text>
      <Button href={url} style={buttonStyle}>
        Delete my account
      </Button>
      <Text style={{ ...bodyTextStyle, margin: "20px 0 0" }}>
        If you didn&apos;t ask for this, ignore this email — nothing changes.
      </Text>
      <Text style={fallbackLinkTextStyle}>
        Or paste this link into your browser:{" "}
        <Link href={url} style={{ color: colors.primaryInk }}>
          {url}
        </Link>
      </Text>
    </EmailLayout>
  );
}

DeleteAccountEmail.PreviewProps = {
  url: "https://timetracker.run/api/auth/delete-user/callback?token=example-token&callbackURL=%2Flogin%3Fdeleted%3D1",
};

export default DeleteAccountEmail;
