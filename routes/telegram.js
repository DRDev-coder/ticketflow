const express = require('express');
const router = express.Router();
const { processWebhookUpdate } = require('../config/telegram');

// Telegram webhook endpoint (Phase 2: Telegram calls this when admin taps buttons or sends messages)
router.post('/api/telegram/webhook', (req, res) => {
  try {
    processWebhookUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error('Telegram webhook error:', err.message);
    res.sendStatus(500);
  }
});

module.exports = router;
