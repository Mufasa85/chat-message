const mongoose = require('mongoose');

const directMessageSchema = new mongoose.Schema({
  from:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:   { type: String, default: '', trim: true, maxlength: 2000 },
  type:      { type: String, enum: ['text', 'image', 'file', 'audio'], default: 'text' },
  attachment: {
    url:          { type: String },
    secureUrl:    { type: String },
    publicId:     { type: String },
    resourceType: { type: String },
    format:       { type: String },
    bytes:        { type: Number },
    filename:     { type: String },
  },
  read:      { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, index: true },
});

directMessageSchema.index({ from: 1, to: 1, createdAt: -1 });
directMessageSchema.index({ to: 1, read: 1 });

module.exports = mongoose.model('DirectMessage', directMessageSchema);
