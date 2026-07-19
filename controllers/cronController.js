const Ticket = require('../models/Ticket');
const Problem = require('../models/Problem');
const User = require('../models/User');
const { getBot } = require('../config/telegram');

/**
 * POST /api/cron/daily-checkin
 * Reviews all open tickets and sends Telegram messages with Yes/No buttons.
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
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (!bot) {
      return res.status(500).json({ error: 'Telegram bot not initialized' });
    }
    if (!chatId) {
      return res.status(500).json({ error: 'TELEGRAM_ADMIN_CHAT_ID not configured' });
    }

    // Find all open tickets (including not_resolved from previous check-ins)
    const openTickets = await Ticket.find({
      status: { $in: ['open', 'not_resolved'] }
    })
      .populate('userId', 'name email')
      .populate('problemId', 'name')
      .sort({ createdAt: 1 })
      .lean();

    if (openTickets.length === 0) {
      await bot.sendMessage(chatId, '✅ *Daily Check-In*\n\nNo open tickets! Everything is resolved. 🎉', {
        parse_mode: 'Markdown'
      });
      return res.json({ message: 'No open tickets', count: 0 });
    }

    // Send header message
    await bot.sendMessage(chatId,
      `📋 *Daily Check-In — ${new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}*\n\n${openTickets.length} open ticket(s) need your attention:`,
      { parse_mode: 'Markdown' }
    );

    // Send a message per open ticket with Yes/No buttons
    let sent = 0;
    for (const ticket of openTickets) {
      const shortId = ticket._id.toString().slice(-8).toUpperCase();
      const userName = ticket.userId?.email || 'Unknown';
      const problemName = ticket.problemId?.name || 'Unknown';
      const createdTime = new Date(ticket.createdAt).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata'
      });

      // Truncate description for Telegram
      const desc = ticket.description.length > 150
        ? ticket.description.substring(0, 150) + '...'
        : ticket.description;

      const statusLabel = ticket.status === 'not_resolved' ? '🔴 Previously Not Resolved' : '🟡 Open';

      const message = [
        `*Ticket #${shortId}* — ${problemName}`,
        `${statusLabel}`,
        `Raised by: ${userName} at ${createdTime}`,
        `Description: _"${desc}"_`,
        '',
        'Is this resolved?'
      ].join('\n');

      const keyboard = {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Yes', callback_data: `resolve_yes_${ticket._id}` },
            { text: '❌ No', callback_data: `resolve_no_${ticket._id}` }
          ]]
        },
        parse_mode: 'Markdown'
      };

      try {
        await bot.sendMessage(chatId, message, keyboard);
        sent++;
        // Small delay between messages to avoid rate limiting
        if (sent < openTickets.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (err) {
        console.error(`Failed to send Telegram message for ticket ${shortId}:`, err.message);
      }
    }

    res.json({
      message: `Daily check-in sent. ${sent} ticket(s) reviewed.`,
      count: sent
    });
  } catch (err) {
    console.error('Daily check-in error:', err);
    res.status(500).json({ error: 'Daily check-in failed' });
  }
};

module.exports = { dailyCheckIn };
