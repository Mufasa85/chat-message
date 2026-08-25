const express = require('express');
const { body, validationResult } = require('express-validator');
const Room = require('../models/Room');
const Message = require('../models/Message');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ error: errors.array()[0].msg });
  next();
};

// GET /api/rooms - Tous les salons publics + salons dont je suis membre
router.get('/', authMiddleware, async (req, res) => {
  try {
    const rooms = await Room.find({
      $or: [{ type: 'public' }, { members: req.user._id }],
    })
      .populate('createdBy', 'username avatar')
      .populate('members', 'username avatar')
      .sort({ createdAt: -1 });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rooms - Créer un salon
router.post(
  '/',
  authMiddleware,
  [
    body('name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Nom: 2-50 caractères'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Description max 200 caractères'),
    body('type')
      .optional()
      .isIn(['public', 'private'])
      .withMessage('Type: public ou private'),
  ],
  validate,
  async (req, res) => {
    try {
      const { name, description, type } = req.body;
      const room = await Room.create({
        name,
        description: description || '',
        type: type || 'public',
        createdBy: req.user._id,
        members: [req.user._id],
      });
      await room.populate('createdBy', 'username avatar');
      await room.populate('members', 'username avatar');
      res.status(201).json(room);
    } catch (err) {
      if (err.code === 11000)
        return res.status(409).json({ error: 'Nom de salon déjà utilisé' });
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/rooms/:id - Détails d'un salon
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id)
      .populate('createdBy', 'username avatar')
      .populate('members', 'username avatar');
    if (!room) return res.status(404).json({ error: 'Salon introuvable' });
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rooms/:id/join - Rejoindre un salon
router.post('/:id/join', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: 'Salon introuvable' });

    if (room.type === 'private') {
      return res
        .status(403)
        .json({ error: 'Salon privé - rejoindre non autorisé' });
    }

    if (room.members.includes(req.user._id)) {
      return res.status(400).json({ error: 'Déjà membre du salon' });
    }

    room.members.push(req.user._id);
    await room.save();
    await room.populate('createdBy', 'username avatar');
    await room.populate('members', 'username avatar');
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/rooms/:id - Modifier un salon
router.put(
  '/:id',
  authMiddleware,
  [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Nom: 2-50 caractères'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Description max 200 caractères'),
  ],
  validate,
  async (req, res) => {
    try {
      const room = await Room.findById(req.params.id);
      if (!room) return res.status(404).json({ error: 'Salon introuvable' });

      // Seul le créateur peut modifier
      if (room.createdBy.toString() !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ error: 'Seul le créateur peut modifier ce salon' });
      }

      if (req.body.name) room.name = req.body.name;
      if (req.body.description !== undefined)
        room.description = req.body.description;

      await room.save();
      await room.populate('createdBy', 'username avatar');
      await room.populate('members', 'username avatar');
      res.json(room);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// DELETE /api/rooms/:id - Supprimer un salon et tous ses messages
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: 'Salon introuvable' });

    // Seul le créateur peut supprimer
    if (room.createdBy.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ error: 'Seul le créateur peut supprimer ce salon' });
    }

    // Supprimer tous les messages du salon
    await Message.deleteMany({ room: req.params.id });

    // Supprimer le salon
    await room.deleteOne();

    res.json({ message: 'Salon et messages supprimés' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rooms/:id/leave - Quitter un salon
router.post('/:id/leave', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: 'Salon introuvable' });

    if (!room.members.includes(req.user._id)) {
      return res.status(400).json({ error: 'Pas membre du salon' });
    }

    if (room.createdBy.toString() === req.user._id.toString()) {
      return res
        .status(400)
        .json({ error: 'Créateur ne peut pas quitter son salon' });
    }

    room.members = room.members.filter(
      (m) => m.toString() !== req.user._id.toString()
    );
    await room.save();
    res.json({ message: 'Salon quitté' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rooms/:id/messages - Messages d'un salon
router.get('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const messages = await Message.find({ room: req.params.id })
      .populate('author', 'username avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();
    const normalized = messages.reverse().map((m) => ({
      ...m,
      reactions: m.reactions
        ? Object.fromEntries(
            Object.entries(m.reactions).map(([emoji, users]) => [
              emoji,
              Array.isArray(users) ? users : Object.values(users),
            ])
          )
        : {},
    }));
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/rooms/:id/messages/:messageId - Modifier un message
router.put(
  '/:id/messages/:messageId',
  authMiddleware,
  [
    body('content')
      .trim()
      .isLength({ min: 1, max: 2000 })
      .withMessage('Contenu: 1-2000 caractères'),
  ],
  validate,
  async (req, res) => {
    try {
      const message = await Message.findById(req.params.messageId);
      if (!message)
        return res.status(404).json({ error: 'Message introuvable' });

      // Vérifier que le salon correspond
      if (message.room.toString() !== req.params.id) {
        return res.status(400).json({ error: 'Message pas dans ce salon' });
      }

      // Seul l'auteur peut modifier son message
      if (message.author.toString() !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ error: "Seul l'auteur peut modifier ce message" });
      }

      message.content = req.body.content;
      await message.save();
      await message.populate('author', 'username avatar');
      res.json(message);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// DELETE /api/rooms/:id/messages/:messageId - Supprimer un message
router.delete('/:id/messages/:messageId', authMiddleware, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: 'Message introuvable' });

    // Seul l'auteur peut supprimer son message
    if (message.author.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ error: "Seul l'auteur peut supprimer ce message" });
    }

    await message.deleteOne();
    res.json({ message: 'Message supprimé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
