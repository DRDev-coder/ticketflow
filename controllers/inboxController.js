/**
 * controllers/inboxController.js
 *
 * Orchestrates Gmail IMAP fetching + Gemini classification + MongoDB storage.
 * Exposes API handlers for the admin inbox UI.
 */

const InboxMessage = require('../models/InboxMessage');
const Problem      = require('../models/Problem');
const { fetchEmails }    = require('../config/imap');
const { classifyEmail }  = require('../config/gemini');
const { sendReplyEmail } = require('../config/mailer');

/** How many days back to fetch on the very first sync (no messages in DB yet). */
const INITIAL_SYNC_DAYS = parseInt(process.env.INBOX_SYNC_DAYS_BACK || '30', 10);

// ─── Internal helper ─────────────────────────────────────────────────────────

/**
 * Core sync logic — called by the API handler and the startup/cron scheduler.
 * Returns a summary object.
 */
const runSync = async () => {
  // 1. Find the date to fetch from (last stored message, or INITIAL_SYNC_DAYS ago)
  const latest = await InboxMessage.findOne().sort({ receivedAt: -1 }).lean();
  const sinceDate = latest
    ? new Date(latest.receivedAt.getTime() - 60_000) // 1-min overlap to avoid gaps
    : new Date(Date.now() - INITIAL_SYNC_DAYS * 24 * 60 * 60 * 1000);

  console.log(`📬 Inbox sync: fetching emails since ${sinceDate.toISOString()}`);

  // 2. Fetch raw emails from Gmail IMAP
  let rawEmails;
  try {
    rawEmails = await fetchEmails(sinceDate);
  } catch (err) {
    console.error('❌ Inbox sync: IMAP fetch failed:', err.message);
    throw err;
  }

  if (rawEmails.length === 0) {
    console.log('📬 Inbox sync: no new emails');
    return { newEmails: 0, skipped: 0 };
  }

  // 3. Load active problems (for classification)
  const problems = await Problem.find({ isActive: true }).select('_id name').lean();
  const problemNames = problems.map(p => p.name);
  const nameToId     = {};
  problems.forEach(p => { nameToId[p.name] = p._id; });

  // 4. Classify and store each email
  let newCount  = 0;
  let skipCount = 0;

  for (const email of rawEmails) {
    // Skip duplicates (already stored)
    const exists = await InboxMessage.exists({ messageId: email.messageId });
    if (exists) { skipCount++; continue; }

    // Classify with Gemini
    let problemName = 'Others';
    let problemId   = null;
    try {
      const classified = await classifyEmail(email.subject, email.bodyText, problemNames);
      if (classified !== 'Others' && nameToId[classified]) {
        problemName = classified;
        problemId   = nameToId[classified];
      }
    } catch (geminiErr) {
      console.error(`Gemini classification failed for "${email.subject}": ${geminiErr.message} — defaulting to Others`);
    }

    // Store in DB
    try {
      await InboxMessage.create({
        messageId:   email.messageId,
        from:        email.from,
        fromEmail:   email.fromEmail,
        subject:     email.subject,
        bodyText:    email.bodyText,
        receivedAt:  email.receivedAt,
        problemId,
        problemName,
        isRead:      false,
        syncedAt:    new Date()
      });
      newCount++;
    } catch (dbErr) {
      // E11000 = duplicate key (race condition) — safe to ignore
      if (dbErr.code !== 11000) {
        console.error(`Failed to store email "${email.subject}":`, dbErr.message);
      } else {
        skipCount++;
      }
    }
  }

  console.log(`✅ Inbox sync complete: ${newCount} new email(s), ${skipCount} duplicate(s) skipped`);
  return { newEmails: newCount, skipped: skipCount };
};

// ─── API Handlers ─────────────────────────────────────────────────────────────

/**
 * POST /api/admin/inbox/sync
 * Manually trigger an inbox sync. Admin only.
 */
const syncInbox = async (req, res) => {
  try {
    const result = await runSync();
    res.json({ message: 'Sync complete', ...result });
  } catch (err) {
    console.error('Inbox sync error:', err);
    res.status(500).json({ error: `Sync failed: ${err.message}` });
  }
};

/**
 * GET /api/admin/inbox/groups
 * Returns all active problems + "Others" with unread message counts.
 * Used to render the sidebar.
 */
const getGroups = async (req, res) => {
  try {
    const problems = await Problem.find({ isActive: true }).select('_id name').sort({ name: 1 }).lean();

    // Aggregate unread counts per problemId
    const unreadAgg = await InboxMessage.aggregate([
      { $match: { isRead: false } },
      { $group: { _id: '$problemId', count: { $sum: 1 } } }
    ]);
    const unreadMap = {};
    unreadAgg.forEach(a => { unreadMap[a._id ? a._id.toString() : 'others'] = a.count; });

    // Total counts per group
    const totalAgg = await InboxMessage.aggregate([
      { $group: { _id: '$problemId', count: { $sum: 1 } } }
    ]);
    const totalMap = {};
    totalAgg.forEach(a => { totalMap[a._id ? a._id.toString() : 'others'] = a.count; });

    // Build groups array
    const groups = problems.map(p => ({
      _id:      p._id,
      name:     p.name,
      unread:   unreadMap[p._id.toString()] || 0,
      total:    totalMap[p._id.toString()]  || 0,
      isOthers: false
    }));

    // Add "Others" at the end
    groups.push({
      _id:      null,
      name:     'Others',
      unread:   unreadMap['others'] || 0,
      total:    totalMap['others']  || 0,
      isOthers: true
    });

    // Last sync timestamp
    const lastMsg = await InboxMessage.findOne().sort({ syncedAt: -1 }).select('syncedAt').lean();

    res.json({ groups, lastSyncedAt: lastMsg?.syncedAt || null });
  } catch (err) {
    console.error('getGroups error:', err);
    res.status(500).json({ error: 'Failed to fetch inbox groups' });
  }
};

/**
 * GET /api/admin/inbox/messages?problemId=<id|null>&page=1&limit=30
 * Returns messages for a specific group (problemId=null → Others).
 */
const getGroupMessages = async (req, res) => {
  try {
    const { problemId } = req.query;
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(50, parseInt(req.query.limit || '30', 10));

    // problemId=null or problemId=others → match documents where problemId is null
    const filter = {};
    if (problemId === 'null' || problemId === 'others' || problemId === '') {
      filter.problemId = null;
    } else {
      filter.problemId = problemId;
    }

    const [messages, total] = await Promise.all([
      InboxMessage.find(filter)
        .sort({ receivedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      InboxMessage.countDocuments(filter)
    ]);

    res.json({ messages, total, page, limit });
  } catch (err) {
    console.error('getGroupMessages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

/**
 * PATCH /api/admin/inbox/messages/:id/read
 * Mark a single message as read.
 */
const markMessageRead = async (req, res) => {
  try {
    await InboxMessage.findByIdAndUpdate(req.params.id, { isRead: true });
    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('markMessageRead error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
};

/**
 * PATCH /api/admin/inbox/groups/read-all?problemId=<id|null>
 * Mark all messages in a group as read.
 */
const markGroupRead = async (req, res) => {
  try {
    const { problemId } = req.query;
    const filter = {};
    if (problemId === 'null' || problemId === 'others' || !problemId) {
      filter.problemId = null;
    } else {
      filter.problemId = problemId;
    }
    await InboxMessage.updateMany(filter, { isRead: true });
    res.json({ message: 'All messages marked as read' });
  } catch (err) {
    console.error('markGroupRead error:', err);
    res.status(500).json({ error: 'Failed to mark group as read' });
  }
};

/**
 * Called by problemController when a problem is deleted.
 * Moves all messages from that problem into "Others".
 */
const reassignToOthers = async (problemId) => {
  const result = await InboxMessage.updateMany(
    { problemId },
    { $set: { problemId: null, problemName: 'Others' } }
  );
  console.log(`📬 Reassigned ${result.modifiedCount} message(s) to Others (problem ${problemId} deleted)`);
};

/**
 * POST /api/admin/inbox/messages/:id/reply
 * Admin sends an email reply to the original sender via Brevo.
 */
const replyToMessage = async (req, res) => {
  try {
    const msg = await InboxMessage.findById(req.params.id).lean();
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const { body } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Reply body cannot be empty' });
    }

    const subject = msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`;
    const originalSnippet = (msg.bodyText || '').substring(0, 300);

    await sendReplyEmail({
      to: msg.fromEmail,
      subject,
      replyBody: body.trim(),
      originalSnippet
    });

    console.log(`📧 Admin reply sent → ${msg.fromEmail} (Re: ${msg.subject})`);
    res.json({ message: `Reply sent to ${msg.fromEmail}` });
  } catch (err) {
    console.error('replyToMessage error:', err);
    res.status(500).json({ error: `Failed to send reply: ${err.message}` });
  }
};

/**
 * PATCH /api/admin/inbox/messages/:id/move
 * Manually move a message to a different problem group (or "Others").
 * Body: { problemId: "<id>" | null }
 */
const moveMessage = async (req, res) => {
  try {
    const { problemId } = req.body;

    let problemName = 'Others';
    let pid = null;

    if (problemId && problemId !== 'null') {
      const problem = await Problem.findById(problemId).lean();
      if (!problem) return res.status(404).json({ error: 'Problem not found' });
      problemName = problem.name;
      pid = problem._id;
    }

    await InboxMessage.findByIdAndUpdate(req.params.id, {
      $set: { problemId: pid, problemName }
    });

    res.json({ message: `Moved to "${problemName}"`, problemName });
  } catch (err) {
    console.error('moveMessage error:', err);
    res.status(500).json({ error: 'Failed to move message' });
  }
};

/**
 * POST /api/admin/inbox/reclassify
 * Re-runs Gemini classification on ALL messages currently in "Others".
 * Call this after setting GEMINI_API_KEY or adding new problem categories.
 * Optionally pass { all: true } in body to reclassify every message (not just Others).
 */
const reclassifyOthers = async (req, res) => {
  try {
    const reclassifyAll = req.body?.all === true;

    const filter = reclassifyAll ? {} : { problemId: null };
    const messages = await InboxMessage.find(filter).lean();

    if (messages.length === 0) {
      return res.json({ message: 'No messages to re-classify', reclassified: 0 });
    }

    const problems = await Problem.find({ isActive: true }).select('_id name').lean();
    const problemNames = problems.map(p => p.name);
    const nameToId = {};
    problems.forEach(p => { nameToId[p.name] = p._id; });

    let reclassified = 0;
    let failed = 0;

    for (const msg of messages) {
      try {
        const classified = await classifyEmail(msg.subject, msg.bodyText, problemNames);
        const newPid  = (classified !== 'Others' && nameToId[classified]) ? nameToId[classified] : null;
        const newName = newPid ? classified : 'Others';

        // Only update if classification actually changed
        const currentPid = msg.problemId ? msg.problemId.toString() : null;
        const newPidStr  = newPid ? newPid.toString() : null;
        if (currentPid !== newPidStr) {
          await InboxMessage.findByIdAndUpdate(msg._id, {
            $set: { problemId: newPid, problemName: newName }
          });
          if (newPid) reclassified++;
        }

        // Small delay to avoid Gemini rate limits
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.error(`Reclassify failed for "${msg.subject}":`, err.message);
        failed++;
      }
    }

    console.log(`✅ Reclassify complete: ${reclassified} moved out of Others, ${failed} failed`);
    res.json({
      message: `Re-classification complete: ${reclassified} message(s) moved to the correct group`,
      reclassified,
      failed,
      total: messages.length
    });
  } catch (err) {
    console.error('reclassifyOthers error:', err);
    res.status(500).json({ error: 'Re-classification failed' });
  }
};

// Export runSync so server.js can call it on startup and from the cron
module.exports = {
  syncInbox, getGroups, getGroupMessages,
  markMessageRead, markGroupRead,
  replyToMessage, moveMessage, reclassifyOthers,
  reassignToOthers, runSync
};

