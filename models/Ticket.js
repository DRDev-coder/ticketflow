const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  problemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
    required: true
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  status: {
    type: String,
    enum: ['open', 'resolved', 'not_resolved'],
    default: 'open'
  },
  assignedEmailAtCreation: {
    type: String,
    required: true
  },
  reasonLog: [{
    reason: {
      type: String,
      enum: ['not_resolved'],
      default: 'not_resolved'
    },
    note: String,
    at: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  lastCheckInAt: {
    type: Date,
    default: null
  }
});

module.exports = mongoose.model('Ticket', ticketSchema);
