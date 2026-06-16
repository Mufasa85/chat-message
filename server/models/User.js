const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true, 
    minlength: 2, 
    maxlength: 30 
  },
  password: { 
    type: String, 
    required: true, 
    minlength: 6 
  },
  avatar: {
    type: String,
    default: function () {
      const colors = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#14b8a6','#f59e0b'];
      return colors[Math.floor(Math.random() * colors.length)];
    },
  },
  bio: {
    type: String,
    default: '',
    maxlength: 150
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  createdAt: { type: Date, default: Date.now },
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
