const Ticket = require('../models/Ticket');
const Problem = require('../models/Problem');
const User = require('../models/User');
const { sendTicketEmail } = require('../config/mailer');

/**
 * POST /api/tickets
 * User raises a new ticket.
 */
const createTicket = async (req, res) => {
  try {
    const { problemId, description } = req.body;

    if (!problemId || !description) {
      return res.status(400).json({ error: 'Problem and description are required' });
    }

    if (description.trim().length < 10) {
      return res.status(400).json({ error: 'Description must be at least 10 characters' });
    }

    // Fetch the problem
    const problem = await Problem.findById(problemId);
    if (!problem || !problem.isActive) {
      return res.status(400).json({ error: 'Invalid or inactive problem category' });
    }

    // Fetch the user (for name/email in the email)
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Create ticket
    const ticket = new Ticket({
      userId: user._id,
      problemId: problem._id,
      description: description.trim(),
      assignedEmailAtCreation: problem.assignedEmail,
      status: 'open'
    });
    await ticket.save();

    // Build short ticket ID for display
    const shortId = ticket._id.toString().slice(-8).toUpperCase();

    // --- Email 1: Send to the problem's assigned email (the recipient / team inbox) ---
    try {
      await sendTicketEmail({
        to: problem.assignedEmail,
        subject: `[Ticket #${shortId}] ${problem.name} — New ticket from ${user.name}`,
        userName: user.name,
        userEmail: user.email,
        problemName: problem.name,
        description: ticket.description,
        ticketId: shortId,
        createdAt: ticket.createdAt
        // No routedTo — recipient already knows they're the destination
      });
      console.log(`📧 Ticket email sent → ${problem.assignedEmail}`);
    } catch (emailErr) {
      console.error(`❌ Email to assigned address (${problem.assignedEmail}) failed:`, emailErr.message);
    }

    // --- Email 2: Always send a separate admin copy to ADMIN_EMAIL ---
    // This is a genuinely separate send, even if the addresses happen to match.
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      try {
        await sendTicketEmail({
          to: adminEmail,
          subject: `[Admin Copy] ${user.name} raised "${problem.name}" — routed to ${problem.assignedEmail}`,
          userName: user.name,
          userEmail: user.email,
          problemName: problem.name,
          description: ticket.description,
          ticketId: shortId,
          createdAt: ticket.createdAt,
          routedTo: problem.assignedEmail   // ← explicit "Routed To" row in the email body
        });
        console.log(`📧 Admin copy sent → ${adminEmail} (routed to: ${problem.assignedEmail})`);
      } catch (emailErr) {
        console.error(`❌ Admin copy email failed:`, emailErr.message);
      }
    }

    res.status(201).json({
      message: 'Ticket raised successfully!',
      ticket: {
        _id: ticket._id,
        shortId,
        problemName: problem.name,
        status: ticket.status,
        createdAt: ticket.createdAt
      }
    });
  } catch (err) {
    console.error('Create ticket error:', err);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
};

/**
 * GET /api/tickets/mine
 * Get the logged-in user's tickets.
 */
const getMyTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find({ userId: req.user.id })
      .populate('problemId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const result = tickets.map(t => ({
      ...t,
      shortId: t._id.toString().slice(-8).toUpperCase(),
      problemName: t.problemId?.name || 'Unknown'
    }));

    res.json(result);
  } catch (err) {
    console.error('Get my tickets error:', err);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
};

module.exports = { createTicket, getMyTickets };
