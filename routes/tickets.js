const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { listActiveProblems } = require('../controllers/problemController');
const { createTicket, getMyTickets } = require('../controllers/ticketController');

// Active problems (for ticket-raising dropdown)
router.get('/api/problems', requireAuth, listActiveProblems);

// Ticket operations
router.post('/api/tickets', requireAuth, createTicket);
router.get('/api/tickets/mine', requireAuth, getMyTickets);

module.exports = router;
