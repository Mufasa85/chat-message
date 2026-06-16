const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  room:      { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:   { type: String, required: true, trim: true, maxlength: 2000 },
  type:      { type: String, enum: ['text','system'], default: 'text' },
  createdAt: { type: Date, default: Date.now, index: true },
});

messageSchema.index({ room: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);