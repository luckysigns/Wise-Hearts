/* ============================================================
   Sending the ebook, over Hostinger's SMTP — the same mail host
   the domain's MX and SPF records already point at, so mail from
   hello@wiseheartsconnect.com authenticates as itself instead of
   arriving via a third party.

   The PDF rides along as an attachment, so the customer never gets
   a link that could be forwarded or guessed.

   Env vars: SMTP_USER (the full mailbox address), SMTP_PASS (that
   mailbox's password). SMTP_HOST and SMTP_PORT are optional and
   default to Hostinger's.
   ============================================================ */

const fs = require("fs/promises");
const nodemailer = require("nodemailer");

const FROM_NAME = "Wise Hearts Connect";

function bodyHtml(firstName, ebookTitle) {
  const hello = firstName ? `Hi ${firstName},` : "Hi there,";
  return `
<div style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#3c3530;max-width:520px">
  <p>${hello}</p>
  <p>Thank you — your copy of <strong>${ebookTitle}</strong> is attached to this email.</p>
  <p>Save it somewhere you'll find it again. You can open it on a phone, tablet, or computer.</p>
  <p>If the attachment didn't come through, just reply to this email and we'll send it straight over.</p>
  <p style="margin-top:28px">Warmly,<br>Hilarey<br>
    <span style="color:#8a7f76">Wise Hearts Connect</span></p>
</div>`.trim();
}

function bodyText(firstName, ebookTitle) {
  const hello = firstName ? `Hi ${firstName},` : "Hi there,";
  return [
    hello,
    "",
    `Thank you — your copy of ${ebookTitle} is attached to this email.`,
    "",
    "Save it somewhere you'll find it again. You can open it on a phone, tablet, or computer.",
    "",
    "If the attachment didn't come through, just reply to this email and we'll send it straight over.",
    "",
    "Warmly,",
    "Hilarey",
    "Wise Hearts Connect"
  ].join("\n");
}

/* One transport per warm container; nodemailer pools the connection. */
let _transport;
function getTransport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user) throw new Error("SMTP_USER is not set");
  if (!pass) throw new Error("SMTP_PASS is not set");

  if (!_transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    _transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.hostinger.com",
      port,
      secure: port === 465, // implicit TLS on 465, STARTTLS on 587
      auth: { user, pass }
    });
  }
  return _transport;
}

async function sendEbook({ to, firstName, ebook }) {
  const from = process.env.SMTP_USER;
  const pdf = await fs.readFile(ebook.file);

  return getTransport().sendMail({
    from: `"${FROM_NAME}" <${from}>`,
    to,
    replyTo: from,
    subject: `Your copy of ${ebook.title}`,
    text: bodyText(firstName, ebook.title),
    html: bodyHtml(firstName, ebook.title),
    attachments: [{ filename: ebook.filename, content: pdf }]
  });
}

module.exports = { sendEbook };
