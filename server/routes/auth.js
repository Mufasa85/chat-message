const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  next();
};

// POST /api/auth/register
router.post('/register', [
  body('username')
    .trim()
    .isLength({ min: 2, max: 30 }).withMessage('Username doit faire 2-30 caractères')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username: lettres, chiffres et _ uniquement'),
  body('password')
    .isLength({ min: 6 }).withMessage('Password doit faire au moins 6 caractères'),
], validate, async (req, res) => {
  try {
    const { username, password } = req.body;
    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'Username déjà pris' });
    
    const user = await User.create({ 
      username: username.toLowerCase(), 
      password 
    });
    res.status(201).json({ token: generateToken(user._id), user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/login
router.post('/login', [
  body('username').trim().notEmpty().withMessage('Username requis'),
  body('password').notEmpty().withMessage('Password requis'),
], validate, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ error: 'Identifiants incorrects' });
    
    res.json({ token: generateToken(user._id), user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => res.json(req.user));

// PUT /api/auth/profile
router.put('/profile', authMiddleware, [
  body('bio').optional().trim().isLength({ max: 150 }).withMessage('Bio max 150 caractères'),
  body('avatar').optional().isHexColor().withMessage('Couleur hex invalide'),
], validate, async (req, res) => {
  try {
    const { bio, avatar } = req.body;
    if (bio !== undefined) req.user.bio = bio;
    if (avatar !== undefined) req.user.avatar = avatar;
    await req.user.save();
    res.json(req.user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/auth/users (search users)
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const { search } = req.query;
    const query = { _id: { $ne: req.user._id } };
    if (search) {
      query.username = { $regex: search, $options: 'i' };
    }
    const users = await User.find(query)
      .select('username avatar bio isOnline lastSeen')
      .limit(20);
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/auth/change-password
router.put('/change-password', authMiddleware, [
  body('currentPassword').notEmpty().withMessage('Mot de passe actuel requis'),
  body('newPassword').isLength({ min: 6 }).withMessage('Nouveau mot de passe : 6 caractères minimum'),
], validate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const isValid = await req.user.comparePassword(currentPassword);
    if (!isValid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    req.user.password = newPassword;
    await req.user.save();
    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
