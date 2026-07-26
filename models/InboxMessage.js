const mongoose = require('mongoose');

/**
 * InboxMessage — stores emails fetched from Gmail via IMAP.
 * Each message is classified by Gemini into a problem group (or "Others").
 */
const inboxMessageSchema = new mongoose.Schema({
  // Gmail's Message-ID header — used to deduplicate on re-sync
  messageId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Sender display string, e.g. "John Doe <john@example.com>"
  from: { type: String, default: '' },
  // Just the sender's email address
  fromEmail: { type: String, default: '' },
  subject: { type: String, default: '(No Subject)' },
  // Plain-text body (used for Gemini classification and display)
  bodyText: { type: String, default: '' },
  // When the email arrived in Gmail
  receivedAt: { type: Date, required: true },
  // The problem this email was classified into.
  // null = "Others" group (unclassified or no matching problem).
  problemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
    default: null,
    index: true
  },
  // Denormalized problem name — survives problem renaming/deletion display
  problemName: { type: String, default: 'Others' },
  // Whether the admin has read this message
  isRead: { type: Boolean, default: false, index: true },
  // When we stored it (used for "last synced X minutes ago" display)
  syncedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InboxMessage', inboxMessageSchema);
