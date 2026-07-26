const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const {
  listProblems,
  createProblem,
  updateProblem,
  deleteProblem
} = require('../controllers/problemController');
const {
  listAllTickets,
  updateTicketStatus,
  getStats
} = require('../controllers/adminController');

const { getRecipient, upsertRecipient } = require('../controllers/recipientController');

// Problem management (admin only)
router.get('/api/admin/problems',       requireAdmin, listProblems);
router.post('/api/admin/problems',      requireAdmin, createProblem);
router.patch('/api/admin/problems/:id', requireAdmin, updateProblem);
router.delete('/api/admin/problems/:id',requireAdmin, deleteProblem);

// Ticket management (admin only)
router.get('/api/admin/tickets', requireAdmin, listAllTickets);
router.patch('/api/admin/tickets/:id', requireAdmin, updateTicketStatus);
router.get('/api/admin/stats', requireAdmin, getStats);

const { getMissingTelegram } = require('../controllers/cronController');

// Recipient management (admin only)
router.get('/api/admin/recipients', requireAdmin, getRecipient);
router.put('/api/admin/recipients', requireAdmin, upsertRecipient);

// Telegram coverage check (admin only)
router.get('/api/admin/missing-telegram', requireAdmin, getMissingTelegram);

module.exports = router;


