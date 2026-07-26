const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const {
  syncInbox,
  getGroups,
  getGroupMessages,
  markMessageRead,
  markGroupRead
} = require('../controllers/inboxController');

// Manual sync trigger
router.post('/api/admin/inbox/sync',              requireAdmin, syncInbox);

// Groups sidebar (all problems + Others with unread counts)
router.get('/api/admin/inbox/groups',              requireAdmin, getGroups);

// Messages for a group (?problemId=<id> or ?problemId=null)
router.get('/api/admin/inbox/messages',            requireAdmin, getGroupMessages);

// Mark one message read
router.patch('/api/admin/inbox/messages/:id/read', requireAdmin, markMessageRead);

// Mark entire group as read
router.patch('/api/admin/inbox/groups/read-all',   requireAdmin, markGroupRead);

module.exports = router;
