const { TelegramBot } = require('node-telegram-bot-api');
const Ticket = require('../models/Ticket');
const Recipient = require('../models/Recipient');

let bot = null;

// In-memory state: tracks which ticket a responder (admin OR any recipient) is providing a reason for.
// Key: chatId (string), Value: ticketId (string)
const pendingReasons = {};

/**
 * Look up a Recipient by their telegramChatId.
 * Returns the Recipient doc or null if not found.
 */
const findRecipientByChatId = async (chatId) => {
  try {
    return await Recipient.findOne({ telegramChatId: String(chatId) }).lean();
  } catch {
    return null;
  }
};

/**
 * Initialize the Telegram bot based on TELEGRAM_MODE env var.
 * - polling: bot repeatedly asks Telegram for updates (works on localhost)
 * - webhook: Telegram pushes updates to /api/telegram/webhook (Phase 2)
 */
const initTelegramBot = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const mode = process.env.TELEGRAM_MODE || 'polling';

  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN not set. Telegram bot disabled.');
    return null;
  }

  if (mode === 'polling') {
    bot = new TelegramBot(token, { polling: true });
    console.log('✅ Telegram bot started (polling mode)');
  } else if (mode === 'webhook') {
    // In webhook mode, we don't start polling — Express handles incoming updates.
    // We register the webhook URL with Telegram immediately on startup.
    bot = new TelegramBot(token, { polling: false });

    const publicUrl = process.env.PUBLIC_URL;
    if (!publicUrl) {
      console.error('❌ Telegram webhook error: PUBLIC_URL is not set. Webhook not registered.');
    } else {
      const webhookUrl = `${publicUrl}/api/telegram/webhook`;
      bot.setWebhook(webhookUrl)
        .then(() => {
          console.log(`✅ Telegram webhook registered: ${webhookUrl}`);
        })
        .catch((err) => {
          console.error(`❌ Telegram webhook registration failed: ${err.message}`);
        });
    }
  } else {
    console.error(`❌ Unknown TELEGRAM_MODE: ${mode}. Use "polling" or "webhook".`);
    return null;
  }

  // --- Handle callback queries (Yes/No button taps) ---
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data; // e.g. "resolve_yes_<ticketId>" or "resolve_no_<ticketId>"
    const messageId = query.message.message_id;

    try {
      if (data.startsWith('resolve_yes_')) {
        const ticketId = data.replace('resolve_yes_', '');
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
          await bot.answerCallbackQuery(query.id, { text: 'Ticket not found' });
          return;
        }

        ticket.status = 'resolved';
        ticket.resolvedAt = new Date();
        ticket.lastCheckInAt = new Date();
        await ticket.save();

        // Edit the original message to show resolved
        await bot.editMessageText(
          `✅ *Marked resolved!*\n\nTicket #${ticketId.slice(-8).toUpperCase()} has been resolved.`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown'
          }
        );
        await bot.answerCallbackQuery(query.id, { text: '✅ Marked resolved!' });

        // --- Step 9: Forward summary to admin ---
        const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
        if (adminChatId && String(chatId) !== String(adminChatId)) {
          const responder = await findRecipientByChatId(chatId);
          const responderLabel = responder?.label || responder?.email || `Chat ${chatId}`;
          const shortId = ticketId.slice(-8).toUpperCase();
          try {
            await bot.sendMessage(
              adminChatId,
              `✅ *${responderLabel}* marked ticket *#${shortId}* as resolved.`,
              { parse_mode: 'Markdown' }
            );
          } catch (e) {
            console.error('Failed to send admin summary (yes):', e.message);
          }
        }

      } else if (data.startsWith('resolve_no_')) {
        const ticketId = data.replace('resolve_no_', '');
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
          await bot.answerCallbackQuery(query.id, { text: 'Ticket not found' });
          return;
        }

        // Set pending reason state
        pendingReasons[chatId] = ticketId;

        await bot.editMessageText(
          `❌ *Not resolved yet*\n\nTicket #${ticketId.slice(-8).toUpperCase()}\n\nPlease type the reason below:`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown'
          }
        );
        await bot.answerCallbackQuery(query.id, { text: 'Please type the reason' });
      }
    } catch (err) {
      console.error('Telegram callback error:', err.message);
      try {
        await bot.answerCallbackQuery(query.id, { text: 'Error processing response' });
      } catch (e) {}
    }
  });

  // --- /start command handler ---
  // Any user who messages the bot with /start gets their own Chat ID back.
  // This lets Sabhari (or any new recipient) confirm their chat ID with our specific bot.
  bot.onText(/^\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from?.first_name || 'there';
    const username = msg.from?.username ? ` (@${msg.from.username})` : '';

    const reply = [
      `👋 Hi ${firstName}${username}!`,
      ``,
      `Your *Telegram Chat ID* with this bot is:`,
      ``,
      `\`${chatId}\``,
      ``,
      `📋 Please share this number with the admin so they can link your inbox to the ticket system.`,
      `Once linked, you\'ll receive daily check-in messages here for any open tickets routed to you.`
    ].join('\n');

    try {
      await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
      console.log(`📱 /start from chat ${chatId} (${firstName}${username}) — replied with their Chat ID`);
    } catch (err) {
      console.error('Failed to send /start reply:', err.message);
    }
  });

  // --- Handle plain text messages (reason capture) ---
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // Skip commands — handled by onText handlers above
    if (!msg.text || msg.text.startsWith('/')) return;

    // Check if we're waiting for a reason from this chat
    const ticketId = pendingReasons[chatId];
    if (!ticketId) return; // No pending reason — ignore

    try {
      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        await bot.sendMessage(chatId, '⚠️ Ticket not found.');
        delete pendingReasons[chatId];
        return;
      }

      // Append reason to log
      ticket.reasonLog.push({
        reason: 'not_resolved',
        note: msg.text,
        at: new Date()
      });
      ticket.status = 'not_resolved';
      ticket.lastCheckInAt = new Date();
      await ticket.save();

      // Clean up pending state
      delete pendingReasons[chatId];

      const shortId = ticketId.slice(-8).toUpperCase();
      await bot.sendMessage(chatId,
        `📝 *Noted!*\n\nTicket #${shortId} marked as *not resolved*.\nReason: _${msg.text}_\n\nThis ticket will appear again in the next daily check-in.`,
        { parse_mode: 'Markdown' }
      );

      // --- Step 9: Forward summary to admin ---
      const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (adminChatId && String(chatId) !== String(adminChatId)) {
        const responder = await findRecipientByChatId(chatId);
        const responderLabel = responder?.label || responder?.email || `Chat ${chatId}`;
        try {
          await bot.sendMessage(
            adminChatId,
            `❌ *${responderLabel}* marked ticket *#${shortId}* as *not resolved*.
Reason: _${msg.text}_`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) {
          console.error('Failed to send admin summary (no):', e.message);
        }
      }
    } catch (err) {
      console.error('Telegram reason capture error:', err.message);
      await bot.sendMessage(chatId, '⚠️ Error saving reason. Please try again.');
      delete pendingReasons[chatId];
    }
  });

  // Handle polling errors gracefully
  bot.on('polling_error', (err) => {
    if (err.code === 'ETELEGRAM' && err.response?.statusCode === 409) {
      console.warn('⚠️ Telegram polling conflict — another instance may be running.');
    } else {
      console.error('Telegram polling error:', err.message);
    }
  });

  return bot;
};

/**
 * Get the bot instance.
 */
const getBot = () => bot;

/**
 * Process a webhook update (used in webhook mode / Phase 2).
 */
const processWebhookUpdate = (update) => {
  if (bot) {
    bot.processUpdate(update);
  }
};

module.exports = { initTelegramBot, getBot, processWebhookUpdate };
