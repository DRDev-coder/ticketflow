const Ticket = require('../models/Ticket');
const Recipient = require('../models/Recipient');
const { getBot } = require('../config/telegram');

/**
 * POST /api/cron/daily-checkin
 * Groups open tickets by assignedEmailAtCreation, looks up each Recipient,
 * and sends Yes/No check-in messages to that Recipient's Telegram Chat ID.
 * If a Recipient has no telegramChatId, skips and flags for admin.
 * Protected by X-Cron-Secret header.
 */
const dailyCheckIn = async (req, res) => {
  try {
    // Verify cron secret
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) {
      return res.status(403).json({ error: 'Invalid cron secret' });
    }

    const bot = getBot();
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (!bot) {
      return res.status(500).json({ error: 'Telegram bot not initialized' });
    }

    // Find all open / not_resolved tickets
    const openTickets = await Ticket.find({
      status: { $in: ['open', 'not_resolved'] }
    })
      .populate('userId', 'name email')
      .populate('problemId', 'name')
      .sort({ createdAt: 1 })
      .lean();

    const dateLabel = new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' });

    if (openTickets.length === 0) {
      if (adminChatId) {
        await bot.sendMessage(adminChatId,
          `✅ *Daily Check-In — ${dateLabel}*\n\nNo open tickets! Everything is resolved. 🎉`,
          { parse_mode: 'Markdown' }
        );
      }
      return res.json({ message: 'No open tickets', count: 0, flagged: [] });
    }

    // --- Group tickets by assignedEmailAtCreation ---
    const groups = {}; // { 'email@x.com': [ticket, ticket, ...] }
    for (const ticket of openTickets) {
      const email = (ticket.assignedEmailAtCreation || '').toLowerCase();
      if (!groups[email]) groups[email] = [];
      groups[email].push(ticket);
    }

    let totalSent = 0;
    const flagged = [];   // { email, ticketCount } — no Chat ID configured
    const delivered = []; // { email, label, count }

    // --- Process each group ---
    for (const [email, tickets] of Object.entries(groups)) {
      const recipient = await Recipient.findOne({ email }).lean();

      if (!recipient || !recipient.telegramChatId) {
        // No Chat ID — skip Telegram, add to flagged list
        flagged.push({ email, ticketCount: tickets.length });
        console.warn(`⚠️  Skipped Telegram check-in for ${email} — no Chat ID configured (${tickets.length} ticket(s))`);
        continue;
      }

      const recipientChatId = recipient.telegramChatId;
      const label = recipient.label || email;

      // Send header to recipient
      try {
        await bot.sendMessage(
          recipientChatId,
          `📋 *Daily Check-In — ${dateLabel}*\n\n${tickets.length} open ticket(s) need your review:`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        console.error(`❌ Failed to send check-in header to ${label} (${recipientChatId}):`, err.message);
        flagged.push({ email, ticketCount: tickets.length, error: err.message });
        continue;
      }

      // Send one message per ticket with Yes/No buttons
      let groupSent = 0;
      for (const ticket of tickets) {
        const shortId = ticket._id.toString().slice(-8).toUpperCase();
        const userEmail = ticket.userId?.email || 'Unknown';
        const problemName = ticket.problemId?.name || 'Unknown';
        const createdTime = new Date(ticket.createdAt).toLocaleString('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Asia/Kolkata'
        });
        const desc = ticket.description.length > 150
          ? ticket.description.substring(0, 150) + '…'
          : ticket.description;
        const statusLabel = ticket.status === 'not_resolved' ? '🔴 Previously Not Resolved' : '🟡 Open';

        const message = [
          `*Ticket #${shortId}* — ${problemName}`,
          statusLabel,
          `Raised by: ${userEmail} at ${createdTime}`,
          `Description: _"${desc}"_`,
          '',
          'Is this resolved?'
        ].join('\n');

        try {
          await bot.sendMessage(recipientChatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ Yes, resolved', callback_data: `resolve_yes_${ticket._id}` },
                { text: '❌ No, not yet', callback_data: `resolve_no_${ticket._id}` }
              ]]
            }
          });
          groupSent++;
          totalSent++;
          // Small delay to avoid rate limiting
          if (groupSent < tickets.length) await new Promise(r => setTimeout(r, 400));
        } catch (err) {
          console.error(`❌ Failed to send check-in for ticket ${shortId} to ${label}:`, err.message);
        }
      }

      delivered.push({ email, label, count: groupSent });
    }

    // --- Notify admin of overall summary ---
    if (adminChatId) {
      const lines = [`📊 *Daily Check-In Summary — ${dateLabel}*`, ''];

      if (delivered.length > 0) {
        lines.push('*Sent to recipients:*');
        delivered.forEach(d => lines.push(`  • ${d.label}: ${d.count} ticket(s)`));
        lines.push('');
      }

      if (flagged.length > 0) {
        lines.push('*⚠️ Skipped (no Telegram Chat ID):*');
        flagged.forEach(f => lines.push(`  • ${f.email}: ${f.ticketCount} ticket(s)`));
        lines.push('');
        lines.push('→ Go to /admin/problems to add the missing Chat IDs.');
      }

      if (delivered.length === 0 && flagged.length === 0) {
        lines.push('Nothing to send.');
      }

      try {
        await bot.sendMessage(adminChatId, lines.join('\n'), { parse_mode: 'Markdown' });
      } catch (err) {
        console.error('Failed to send admin summary:', err.message);
      }
    }

    console.log(`✅ Daily check-in: ${totalSent} message(s) sent, ${flagged.length} group(s) skipped.`);
    res.json({
      message: `Daily check-in complete. ${totalSent} ticket(s) sent to recipients.`,
      sent: totalSent,
      delivered,
      flagged
    });
  } catch (err) {
    console.error('Daily check-in error:', err);
    res.status(500).json({ error: 'Daily check-in failed' });
  }
};

/**
 * GET /api/admin/missing-telegram
 * Returns email groups that have open tickets but no Telegram Chat ID configured.
 * Used to display a warning banner on the admin dashboard.
 */
const getMissingTelegram = async (req, res) => {
  try {
    // Find all distinct assignedEmailAtCreation among open tickets
    const openTickets = await Ticket.find(
      { status: { $in: ['open', 'not_resolved'] } },
      { assignedEmailAtCreation: 1 }
    ).lean();

    const emailCounts = {};
    for (const t of openTickets) {
      const e = (t.assignedEmailAtCreation || '').toLowerCase();
      emailCounts[e] = (emailCounts[e] || 0) + 1;
    }

    const missing = [];
    for (const [email, count] of Object.entries(emailCounts)) {
      const recipient = await Recipient.findOne({ email }).lean();
      if (!recipient || !recipient.telegramChatId) {
        missing.push({
          email,
          label: recipient?.label || null,
          ticketCount: count
        });
      }
    }

    res.json(missing);
  } catch (err) {
    console.error('getMissingTelegram error:', err);
    res.status(500).json({ error: 'Failed to check Telegram coverage' });
  }
};

module.exports = { dailyCheckIn, getMissingTelegram };
