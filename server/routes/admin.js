const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { checkRole } = require('../middleware/checkRole');

router.use(authMiddleware, checkRole('admin'));

// GET /api/admin/users — lister tous les utilisateurs
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
  }
});

// PATCH /api/admin/users/:id/role — changer le rôle
router.patch('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour du rôle' });
  }
});

// DELETE /api/admin/users/:id — supprimer un utilisateur
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ message: 'Utilisateur supprimé', userId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

module.exports = router;