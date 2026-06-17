const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  room:      { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:   { type: String, required: true, trim: true, maxlength: 2000 },
  type:      { type: String, enum: ['text','system'], default: 'text' },
  createdAt: { type: Date, default: Date.now, index: true },
  
  // === CHAMPS MESSAGERIE ÉPHÉMÈRE ===
  ephemeral: { 
    type: Boolean, 
    default: false,
    index: true 
  },
  ttl: { 
    type: Number, 
    default: () => parseInt(process.env.DEFAULT_MESSAGE_TTL) || 300, 
    min: 1,
    max: 86400     // max 24h
  },
  expiresAt: { 
    type: Date, 
    index: true 
  }
});

// Index composé pour les messages éphémères
messageSchema.index({ ephemeral: 1, expiresAt: 1 });

// Middleware pre-save : calcul automatique de expiresAt
messageSchema.pre('save', function(next) {
  if (this.ephemeral && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + this.ttl * 1000);
  }
  next();
});

// Méthode statique pour créer un message éphémère
messageSchema.statics.createEphemeral = async function(data, ttlSeconds) {
  const ephemeralMessage = new this({
    ...data,
    ephemeral: true,
    ttl: ttlSeconds,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000)
  });
  return ephemeralMessage.save();
};

messageSchema.index({ room: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
