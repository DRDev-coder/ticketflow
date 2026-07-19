const Ticket = require('../models/Ticket');
const Problem = require('../models/Problem');

/**
 * GET /api/admin/tickets
 * List all tickets with filtering (admin only).
 */
const listAllTickets = async (req, res) => {
  try {
    const { status, problemId } = req.query;
    const filter = {};
    if (status && ['open', 'resolved', 'not_resolved'].includes(status)) {
      filter.status = status;
    }
    if (problemId) {
      filter.problemId = problemId;
    }

    const tickets = await Ticket.find(filter)
      .populate('userId', 'name email')
      .populate('problemId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const result = tickets.map(t => ({
      ...t,
      shortId: t._id.toString().slice(-8).toUpperCase(),
      userName: t.userId?.name || 'Unknown',
      userEmail: t.userId?.email || 'Unknown',
      problemName: t.problemId?.name || 'Unknown'
    }));

    res.json(result);
  } catch (err) {
    console.error('List all tickets error:', err);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
};

/**
 * PATCH /api/admin/tickets/:id
 * Admin manually marks a ticket as resolved or not_resolved.
 */
const updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

    if (!status || !['resolved', 'not_resolved', 'open'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be: open, resolved, or not_resolved' });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    ticket.status = status;

    if (status === 'resolved') {
      ticket.resolvedAt = new Date();
    } else if (status === 'not_resolved') {
      ticket.reasonLog.push({
        reason: 'not_resolved',
        note: note || 'Marked as not resolved by admin',
        at: new Date()
      });
      ticket.resolvedAt = null;
    } else if (status === 'open') {
      ticket.resolvedAt = null;
    }

    await ticket.save();

    res.json({
      message: `Ticket marked as ${status.replace('_', ' ')}`,
      ticket
    });
  } catch (err) {
    console.error('Update ticket status error:', err);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
};

/**
 * GET /api/admin/stats
 * Admin dashboard statistics.
 */
const getStats = async (req, res) => {
  try {
    const [total, open, resolved, notResolved] = await Promise.all([
      Ticket.countDocuments(),
      Ticket.countDocuments({ status: 'open' }),
      Ticket.countDocuments({ status: 'resolved' }),
      Ticket.countDocuments({ status: 'not_resolved' })
    ]);
    res.json({ total, open, resolved, notResolved });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};

module.exports = { listAllTickets, updateTicketStatus, getStats };
