const express = require('express');
const Room = require('../models/Room');
const Message = require('../models/Message');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const rooms = await Room.find({ type: 'public' })
      .populate('createdBy', 'username avatar')
      .sort({ createdAt: -1 });
    res.json(rooms);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, type } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    const room = await Room.create({
      name, description, type: type || 'public',
      createdBy: req.user._id, members: [req.user._id],
    });
    await room.populate('createdBy', 'username avatar');
    res.status(201).json(room);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Nom de salon déjà utilisé' });
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const messages = await Message.find({ room: req.params.id })
      .populate('author', 'username avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json(messages.reverse());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;