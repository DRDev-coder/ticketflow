/**
 * config/imap.js — Fetch emails from Gmail via IMAP.
 *
 * Uses imapflow (modern promise-based IMAP client).
 * A new connection is opened and closed on every call — no persistent socket.
 * This is Render-friendly (no hanging connections between syncs).
 *
 * Required env vars:
 *   GMAIL_USER          — e.g. darshan5154896@gmail.com
 *   GMAIL_APP_PASSWORD  — 16-char Gmail App Password (spaces ignored by Gmail)
 */

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

/**
 * Fetch emails received since `sinceDate` from the Gmail INBOX.
 *
 * @param {Date} sinceDate  - Only fetch emails received after this date.
 * @returns {Promise<Array>} Array of { messageId, from, fromEmail, subject, bodyText, receivedAt }
 */
const fetchEmails = async (sinceDate) => {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('GMAIL_USER or GMAIL_APP_PASSWORD is not set in environment');
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false  // suppress verbose imap logs
  });

  const emails = [];

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    // Search for all messages since the given date
    const uids = await client.search({ since: sinceDate });

    if (!uids || uids.length === 0) {
      await client.logout();
      return [];
    }

    // Fetch raw source for each matched message
    for await (const msg of client.fetch(uids, { source: true, envelope: true })) {
      try {
        const parsed = await simpleParser(msg.source);

        // Extract sender info
        const fromAddr = parsed.from?.value?.[0];
        const fromEmail = fromAddr?.address || '';
        const fromName  = fromAddr?.name || fromEmail;
        const from      = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

        // Use Message-ID header for deduplication; fall back to UID+date
        const messageId = parsed.messageId
          || `uid-${msg.uid}-${(parsed.date || new Date()).getTime()}`;

        // Prefer plain text; strip excessive whitespace
        const bodyText = (parsed.text || '')
          .replace(/\r\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .substring(0, 3000);  // cap at 3 000 chars — enough for Gemini

        emails.push({
          messageId,
          from,
          fromEmail,
          subject: parsed.subject || '(No Subject)',
          bodyText,
          receivedAt: parsed.date || new Date()
        });
      } catch (parseErr) {
        console.error('IMAP: failed to parse one message, skipping:', parseErr.message);
      }
    }

    await client.logout();
  } catch (err) {
    // Always try to close the connection cleanly
    try { await client.logout(); } catch (_) {}
    throw err;
  }

  return emails;
};

module.exports = { fetchEmails };
