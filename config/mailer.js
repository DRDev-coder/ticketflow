/**
 * mailer.js — Brevo transactional email API (HTTP, no SMTP).
 *
 * Render (free tier) permanently blocks outbound SMTP ports 25/465/587, so
 * Nodemailer+Gmail cannot work there. Brevo's REST API sends email over
 * standard HTTPS (port 443), which is always allowed.
 *
 * Required env var: BREVO_API_KEY
 * Verified sender in Brevo: darshan5154896@gmail.com
 */

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const FROM_EMAIL = 'darshan5154896@gmail.com';
const FROM_NAME = 'TicketFlow';

/**
 * Low-level helper — POST a single email via Brevo's transactional API.
 * Throws if the API returns a non-2xx status.
 */
const sendViaBrevo = async ({ to, subject, htmlContent }) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not set in environment');
  }

  const body = {
    sender: { name: FROM_NAME, email: FROM_EMAIL },
    to: [{ email: to }],
    subject,
    htmlContent
  };

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '(no body)');
    throw new Error(`Brevo API error ${response.status}: ${detail}`);
  }
};

/**
 * Send a ticket notification email.
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.userName - Name of the user who raised the ticket
 * @param {string} options.userEmail - Email of the user who raised the ticket
 * @param {string} options.problemName - Problem category name
 * @param {string} options.description - Ticket description
 * @param {string} options.ticketId - Ticket ID
 * @param {Date}   options.createdAt - Ticket creation timestamp
 * @param {string} [options.routedTo] - If set, renders a "Routed To" row (used for admin copy)
 */
const sendTicketEmail = async ({ to, subject, userName, userEmail, problemName, description, ticketId, createdAt, routedTo }) => {
  const timestamp = new Date(createdAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0F172A; color: #F8FAFC; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #1E293B, #0F172A); padding: 24px 32px; border-bottom: 1px solid #334155;">
        <h1 style="margin: 0; font-size: 20px; color: #22C55E;">🎫 New Ticket Raised</h1>
      </div>
      <div style="padding: 24px 32px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #94A3B8; font-size: 13px; width: 120px;">Ticket ID</td>
            <td style="padding: 8px 0; font-family: monospace; color: #22C55E; font-size: 13px;">${ticketId}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #94A3B8; font-size: 13px;">Category</td>
            <td style="padding: 8px 0; font-size: 14px;">${problemName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #94A3B8; font-size: 13px;">Raised By</td>
            <td style="padding: 8px 0; font-size: 14px;">${userName} (${userEmail})</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #94A3B8; font-size: 13px;">Time</td>
            <td style="padding: 8px 0; font-size: 14px;">${timestamp}</td>
          </tr>
          ${routedTo ? `
          <tr>
            <td style="padding: 8px 0; color: #94A3B8; font-size: 13px;">Routed To</td>
            <td style="padding: 8px 0; font-size: 14px; color: #60A5FA; font-family: monospace;">${routedTo}</td>
          </tr>` : ''}
        </table>
        <div style="margin-top: 16px; padding: 16px; background: #1A1E2F; border-radius: 8px; border: 1px solid #334155;">
          <p style="margin: 0 0 4px; color: #94A3B8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Description</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${description}</p>
        </div>
      </div>
      <div style="padding: 16px 32px; background: #1E293B; border-top: 1px solid #334155; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #64748B;">TicketFlow — Internal Ticket Routing System</p>
      </div>
    </div>
  `;

  await sendViaBrevo({ to, subject, htmlContent });
};

/**
 * Send a 6-digit OTP email for signup verification.
 * @param {string} to   - Recipient email
 * @param {string} otp  - The 6-digit code
 */
const sendOtpEmail = async (to, otp) => {
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0F172A; color: #F8FAFC; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #1E293B, #0F172A); padding: 24px 32px; border-bottom: 1px solid #334155;">
        <h1 style="margin: 0; font-size: 20px; color: #22C55E;">🔐 Verify your email</h1>
      </div>
      <div style="padding: 32px; text-align: center;">
        <p style="margin: 0 0 24px; color: #94A3B8; font-size: 14px; line-height: 1.6;">
          Enter this code on the verification page to activate your TicketFlow account.
          It expires in <strong style="color: #F8FAFC;">10 minutes</strong>.
        </p>
        <div style="display: inline-block; background: #1E293B; border: 2px solid #334155; border-radius: 12px; padding: 20px 36px;">
          <span style="font-family: monospace; font-size: 42px; font-weight: 700; letter-spacing: 12px; color: #22C55E;">${otp}</span>
        </div>
        <p style="margin: 24px 0 0; color: #64748B; font-size: 12px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
      <div style="padding: 16px 32px; background: #1E293B; border-top: 1px solid #334155; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #64748B;">TicketFlow — Internal Ticket Routing System</p>
      </div>
    </div>
  `;

  await sendViaBrevo({
    to,
    subject: `${otp} — your TicketFlow verification code`,
    htmlContent
  });
};

/**
 * Verify Brevo configuration on startup (checks the API key is present and
 * that the API responds — does not send a real email).
 */
const verifyMailer = async () => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error('❌ Email transporter error: BREVO_API_KEY is not set in .env');
    console.error('   Add BREVO_API_KEY to your environment and redeploy.');
    return;
  }

  // Lightweight check: hit the account endpoint to confirm the key is valid.
  try {
    const res = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': apiKey, 'accept': 'application/json' }
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`✅ Email transporter ready (Brevo API — plan: ${data.plan?.[0]?.type ?? 'unknown'})`);
    } else {
      const detail = await res.text().catch(() => '');
      console.error(`❌ Email transporter error: Brevo API key rejected (${res.status}) — ${detail}`);
    }
  } catch (err) {
    console.error('❌ Email transporter error:', err.message);
  }
};

/**
 * sendReplyEmail — admin replies to an email from the inbox.
 * @param {Object} opts
 *   to          — recipient email address
 *   subject     — subject line (should start with "Re:")
 *   replyBody   — plain-text reply composed by admin
 *   originalSnippet — first 200 chars of the original message (quoted below the reply)
 */
const sendReplyEmail = async ({ to, subject, replyBody, originalSnippet }) => {
  const htmlContent = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0F172A;color:#E2E8F0;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#22C55E,#16A34A);padding:20px 24px;">
        <h2 style="margin:0;color:#fff;font-size:18px;">Reply from TicketFlow Support</h2>
      </div>
      <div style="padding:24px;">
        <p style="white-space:pre-wrap;line-height:1.7;color:#E2E8F0;margin:0 0 24px;">${replyBody.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
        ${originalSnippet ? `
        <div style="border-left:3px solid #334155;padding:12px 16px;margin-top:16px;color:#94A3B8;font-size:13px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;color:#64748B;">Original message</div>
          <p style="margin:0;white-space:pre-wrap;">${originalSnippet.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
        </div>` : ''}
        <hr style="border:none;border-top:1px solid #1E293B;margin:24px 0;">
        <p style="color:#64748B;font-size:12px;margin:0;">This reply was sent via TicketFlow Admin.</p>
      </div>
    </div>`;

  await sendViaBrevo({ to, subject, htmlContent });
};

module.exports = { sendTicketEmail, sendOtpEmail, sendReplyEmail, verifyMailer };
