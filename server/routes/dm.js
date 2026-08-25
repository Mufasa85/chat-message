const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const DirectMessage = require('../models/DirectMessage');
const User = require('../models/User');

const router = express.Router();

// GET /api/dm/conversations — liste des conversations (1 par interlocuteur)
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const myId = req.user._id;
    const msgs = await DirectMessage.find({
      $or: [{ from: myId }, { to: myId }],
    })
      .sort({ createdAt: -1 })
      .populate('from', 'username avatar isOnline status')
      .populate('to', 'username avatar isOnline status');

    // Dédupliquer : garder le dernier message par paire (from+to)
    const seen = new Map();
    for (const m of msgs) {
      const other = String(m.from._id) === String(myId) ? m.to : m.from;
      const key = String(other._id);
      if (!seen.has(key)) seen.set(key, { other, lastMessage: m });
    }

    // Compter les non-lus par interlocuteur
    const unreadAgg = await DirectMessage.aggregate([
      { $match: { to: myId, read: false } },
      { $group: { _id: '$from', count: { $sum: 1 } } },
    ]);
    const unreadMap = {};
    for (const u of unreadAgg) unreadMap[String(u._id)] = u.count;

    const conversations = [...seen.values()].map(({ other, lastMessage }) => ({
      user: other,
      lastMessage: {
        content: lastMessage.content,
        type: lastMessage.type,
        createdAt: lastMessage.createdAt,
        fromMe: String(lastMessage.from._id) === String(myId),
      },
      unread: unreadMap[String(other._id)] || 0,
    }));

    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dm/:userId — messages avec un utilisateur
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const myId = req.user._id;
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before;

    const query = {
      $or: [
        { from: myId, to: userId },
        { from: userId, to: myId },
      ],
    };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await DirectMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('from', 'username avatar')
      .populate('to', 'username avatar');

    // Marquer comme lus les messages reçus
    await DirectMessage.updateMany(
      { from: userId, to: myId, read: false },
      { read: true }
    );

    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dm/:userId — envoyer un message privé (REST fallback)
router.post('/:userId', authMiddleware, async (req, res) => {
  try {
    const { content, type, attachment } = req.body;
    if (!content?.trim() && !attachment)
      return res.status(400).json({ error: 'Contenu vide' });

    const target = await User.findById(req.params.userId).select(
      '_id username'
    );
    if (!target)
      return res.status(404).json({ error: 'Utilisateur introuvable' });

    const msg = await DirectMessage.create({
      from: req.user._id,
      to: target._id,
      content: content?.trim() || '',
      type: type || 'text',
      attachment: attachment || undefined,
    });
    await msg.populate('from', 'username avatar');
    await msg.populate('to', 'username avatar');

    res.status(201).json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dm/unread/count — total messages non lus
router.get('/unread/count', authMiddleware, async (req, res) => {
  try {
    const count = await DirectMessage.countDocuments({
      to: req.user._id,
      read: false,
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dm/users/list — liste des utilisateurs pour démarrer une conv
router.get('/users/list', authMiddleware, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select('username avatar isOnline status')
      .sort({ username: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
