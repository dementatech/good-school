// Transactional email via Resend (https://resend.com). One HTTPS call, no SDK.
//
// Set RESEND_API_KEY + RESEND_FROM to send for real. With no API key the
// message is logged instead of sent — so a local/dev deploy doesn't silently
// swallow mail, and a self-hosted operator can still copy a reset link out of
// the backend logs until they wire a provider.

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Resend lets you send from onboarding@resend.dev with no domain setup — fine
// to start, swap for a verified domain address before real traffic.
const RESEND_FROM = process.env.RESEND_FROM ?? "Good School <onboarding@resend.dev>";

export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn(
      `[email] RESEND_API_KEY not set — not sending. Would have sent to ${to}:\n` +
        `  subject: ${subject}\n` +
        text
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n"),
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API responded ${res.status}: ${body}`);
  }
}
