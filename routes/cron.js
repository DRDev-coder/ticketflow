const express = require('express');
const router = express.Router();
const { dailyCheckIn, getMissingTelegram } = require('../controllers/cronController');

// Daily check-in endpoint (protected by X-Cron-Secret header)
router.post('/api/cron/daily-checkin', dailyCheckIn);

module.exports = router;
