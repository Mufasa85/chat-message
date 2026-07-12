const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Message = require('../models/Message');
const Room = require('../models/Room');
const { authMiddleware } = require('../middleware/auth');
const { checkRole } = require('../middleware/checkRole');

router.use(authMiddleware, checkRole('admin'));

// ═══════════════════════════════════════
// STATS
// ═══════════════════════════════════════

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [totalUsers, onlineUsers, totalMessages, messagesToday, adminCount, totalRooms, bannedUsers, disabledUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isOnline: true }),
      Message.countDocuments(),
      Message.countDocuments({ createdAt: { $gte: startOfDay } }),
      User.countDocuments({ role: 'admin' }),
      Room.countDocuments(),
      User.countDocuments({ isBanned: true }),
      User.countDocuments({ isDisabled: true }),
    ]);
    res.json({ totalUsers, onlineUsers, totalMessages, messagesToday, adminCount, totalRooms, bannedUsers, disabledUsers, generatedAt: now.toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// USERS
// ═══════════════════════════════════════

// GET /api/admin/users — liste avec filtre optionnel ?search=&role=&status=
router.get('/users', async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const query = {};
    if (search) query.$or = [
      { username: { $regex: search, $options: 'i' } },
      { fullName:  { $regex: search, $options: 'i' } },
      { email:     { $regex: search, $options: 'i' } },
    ];
    if (role   && ['user','admin'].includes(role))   query.role   = role;
    if (status && ['online','busy','invisible','offline'].includes(status)) query.status = status;
    const users = await User.find(query).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users — créer un utilisateur
router.post('/users', async (req, res) => {
  try {
    const { username, password, role, fullName, email, phone } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username et password requis' });
    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'Username déjà pris' });
    const user = await User.create({ username: username.toLowerCase(), password, role: role || 'user', fullName: fullName || '', email: email || '', phone: phone || '' });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/:id — détail d'un utilisateur
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id — modifier les infos d'un utilisateur
router.patch('/users/:id', async (req, res) => {
  try {
    const allowed = ['fullName', 'email', 'phone', 'bio', 'role', 'avatar', 'profilePicture'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (updates.role && !['user','admin'].includes(updates.role)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/role
router.patch('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/disable — désactiver / réactiver
router.patch('/users/:id/disable', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    user.isDisabled = !user.isDisabled;
    await user.save();
    res.json({ isDisabled: user.isDisabled, _id: user._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/ban — bannir / débannir
router.patch('/users/:id/ban', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    user.isBanned = !user.isBanned;
    await user.save();
    res.json({ isBanned: user.isBanned, _id: user._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/reset-password — réinitialiser le mot de passe
router.patch('/users/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id — suppression définitive
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ message: 'Utilisateur supprimé', userId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// ROOMS (GROUPES)
// ═══════════════════════════════════════

// GET /api/admin/rooms
router.get('/rooms', async (req, res) => {
  try {
    const rooms = await Room.find()
      .populate('createdBy', 'username avatar')
      .sort({ createdAt: -1 });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/rooms/:id — modifier nom/description
router.patch('/rooms/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const updates = {};
    if (name)        updates.name        = name.trim();
    if (description !== undefined) updates.description = description.trim();
    const room = await Room.findByIdAndUpdate(req.params.id, updates, { new: true }).populate('createdBy', 'username avatar');
    if (!room) return res.status(404).json({ error: 'Salon introuvable' });
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/rooms/:id — supprimer un salon + ses messages
router.delete('/rooms/:id', async (req, res) => {
  try {
    const room = await Room.findByIdAndDelete(req.params.id);
    if (!room) return res.status(404).json({ error: 'Salon introuvable' });
    await Message.deleteMany({ room: req.params.id });
    res.json({ message: 'Salon et messages supprimés', roomId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/rooms/:id/members — ajouter ou retirer un membre
router.patch('/rooms/:id/members', async (req, res) => {
  try {
    const { userId, action } = req.body; // action: 'add' | 'remove'
    if (!['add','remove'].includes(action)) return res.status(400).json({ error: 'action doit être add ou remove' });
    const update = action === 'add'
      ? { $addToSet: { members: userId } }
      : { $pull:     { members: userId } };
    const room = await Room.findByIdAndUpdate(req.params.id, update, { new: true }).populate('createdBy', 'username avatar');
    if (!room) return res.status(404).json({ error: 'Salon introuvable' });
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════

// GET /api/admin/rooms/:id/messages — messages d'un salon
router.get('/rooms/:id/messages', async (req, res) => {
  try {
    const messages = await Message.find({ room: req.params.id })
      .populate('author', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/messages/:id — supprimer un message
router.delete('/messages/:id', async (req, res) => {
  try {
    const msg = await Message.findByIdAndDelete(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Message introuvable' });
    res.json({ message: 'Message supprimé', messageId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;