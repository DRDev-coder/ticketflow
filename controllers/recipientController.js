const Recipient = require('../models/Recipient');

/**
 * GET /api/admin/recipients?email=...
 * Fetch a single Recipient by email (admin only).
 * Returns { found: false } if no record exists yet.
 */
const getRecipient = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'email query param is required' });
    }

    const recipient = await Recipient.findOne({
      email: email.trim().toLowerCase()
    }).lean();

    if (!recipient) {
      return res.json({ found: false, email: email.trim().toLowerCase() });
    }

    res.json({ found: true, ...recipient });
  } catch (err) {
    console.error('getRecipient error:', err);
    res.status(500).json({ error: 'Failed to fetch recipient' });
  }
};

/**
 * PUT /api/admin/recipients
 * Upsert a Recipient by email — creates or updates telegramChatId / label (admin only).
 * Body: { email, telegramChatId, label }
 */
const upsertRecipient = async (req, res) => {
  try {
    const { email, telegramChatId, label } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const update = {};
    if (telegramChatId !== undefined) {
      update.telegramChatId = telegramChatId ? String(telegramChatId).trim() : null;
    }
    if (label !== undefined) {
      update.label = label.trim();
    }

    const recipient = await Recipient.findOneAndUpdate(
      { email: email.trim().toLowerCase() },
      { $set: update, $setOnInsert: { email: email.trim().toLowerCase() } },
      { upsert: true, returnDocument: 'after' }
    );

    res.json({
      message: 'Recipient saved',
      recipient
    });
  } catch (err) {
    console.error('upsertRecipient error:', err);
    res.status(500).json({ error: 'Failed to save recipient' });
  }
};

module.exports = { getRecipient, upsertRecipient };
