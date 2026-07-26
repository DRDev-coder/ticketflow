const Problem = require('../models/Problem');
const Ticket = require('../models/Ticket');
const InboxMessage = require('../models/InboxMessage');

/**
 * GET /api/admin/problems
 * List all problems with ticket counts (admin only).
 */
const listProblems = async (req, res) => {
  try {
    const problems = await Problem.find().sort({ createdAt: 1 }).lean();

    // Get ticket counts per problem
    const ticketCounts = await Ticket.aggregate([
      { $group: { _id: '$problemId', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    ticketCounts.forEach(t => { countMap[t._id.toString()] = t.count; });

    const result = problems.map(p => ({
      ...p,
      ticketCount: countMap[p._id.toString()] || 0
    }));

    res.json(result);
  } catch (err) {
    console.error('List problems error:', err);
    res.status(500).json({ error: 'Failed to fetch problems' });
  }
};

/**
 * POST /api/admin/problems
 * Create a new problem category (admin only).
 */
const createProblem = async (req, res) => {
  try {
    const { name, assignedEmail } = req.body;

    if (!name || !assignedEmail) {
      return res.status(400).json({ error: 'Name and assigned email are required' });
    }

    // Validate email format
    if (!/^\S+@\S+\.\S+$/.test(assignedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const problem = new Problem({
      name: name.trim(),
      assignedEmail: assignedEmail.trim().toLowerCase()
    });
    await problem.save();

    res.status(201).json({
      message: 'Problem created successfully',
      problem
    });
  } catch (err) {
    console.error('Create problem error:', err);
    res.status(500).json({ error: 'Failed to create problem' });
  }
};

/**
 * PATCH /api/admin/problems/:id
 * Update a problem's name, email, or active status (admin only).
 */
const updateProblem = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, assignedEmail, isActive } = req.body;

    const problem = await Problem.findById(id);
    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    if (name !== undefined) problem.name = name.trim();
    if (assignedEmail !== undefined) {
      if (!/^\S+@\S+\.\S+$/.test(assignedEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
      }
      problem.assignedEmail = assignedEmail.trim().toLowerCase();
    }
    if (isActive !== undefined) problem.isActive = isActive;

    await problem.save();

    res.json({
      message: 'Problem updated successfully',
      problem
    });
  } catch (err) {
    console.error('Update problem error:', err);
    res.status(500).json({ error: 'Failed to update problem' });
  }
};

/**
 * GET /api/problems
 * List active problems (for user ticket-raising dropdown).
 */
const listActiveProblems = async (req, res) => {
  try {
    const problems = await Problem.find({ isActive: true })
      .select('name _id')
      .sort({ name: 1 })
      .lean();
    res.json(problems);
  } catch (err) {
    console.error('List active problems error:', err);
    res.status(500).json({ error: 'Failed to fetch problems' });
  }
};

/**
 * DELETE /api/admin/problems/:id
 * Delete a problem category (admin only).
 * Reassigns its inbox messages to "Others" before deleting.
 */
const deleteProblem = async (req, res) => {
  try {
    const { id } = req.params;

    const problem = await Problem.findById(id);
    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    // Move any classified inbox messages to "Others" before deleting
    const moved = await InboxMessage.updateMany(
      { problemId: id },
      { $set: { problemId: null, problemName: 'Others' } }
    );
    if (moved.modifiedCount > 0) {
      console.log(`📬 Moved ${moved.modifiedCount} inbox message(s) to Others (problem "${problem.name}" deleted)`);
    }

    await Problem.findByIdAndDelete(id);

    res.json({ message: `Problem "${problem.name}" deleted successfully` });
  } catch (err) {
    console.error('Delete problem error:', err);
    res.status(500).json({ error: 'Failed to delete problem' });
  }
};

module.exports = { listProblems, createProblem, updateProblem, listActiveProblems, deleteProblem };
