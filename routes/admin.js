const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const {
  listProblems,
  createProblem,
  updateProblem
} = require('../controllers/problemController');
const {
  listAllTickets,
  updateTicketStatus,
  getStats
} = require('../controllers/adminController');

// Problem management (admin only)
router.get('/api/admin/problems', requireAdmin, listProblems);
router.post('/api/admin/problems', requireAdmin, createProblem);
router.patch('/api/admin/problems/:id', requireAdmin, updateProblem);

// Ticket management (admin only)
router.get('/api/admin/tickets', requireAdmin, listAllTickets);
router.patch('/api/admin/tickets/:id', requireAdmin, updateTicketStatus);
router.get('/api/admin/stats', requireAdmin, getStats);

module.exports = router;
