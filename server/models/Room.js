const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true, trim: true, maxlength: 50 },
  description: { type: String, default: '', maxlength: 200 },
  type:        { type: String, enum: ['public','private'], default: 'public' },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt:   { type: Date, default: Date.now },
});

module.exports = mongoose.model('Room', roomSchema);