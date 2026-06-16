const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username et password requis' });
    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ error: 'Username déjà pris' });
    const user = await User.create({ username, password });
    res.status(201).json({ token: generateToken(user._id), user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ error: 'Identifiants incorrects' });
    res.json({ token: generateToken(user._id), user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/me', authMiddleware, (req, res) => res.json(req.user));

module.exports = router;