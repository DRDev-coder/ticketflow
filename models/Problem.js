const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Problem name is required'],
    trim: true,
    maxlength: [100, 'Problem name cannot exceed 100 characters']
  },
  assignedEmail: {
    type: String,
    required: [true, 'Assigned email is required'],
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Problem', problemSchema);
