#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# setup-profile.sh
#
# Génère la page Profil utilisateur + tableau de bord Admin :
#   1. Route API  : POST /api/auth/change-password
#   2. Route API  : GET  /api/admin/stats (stats globales pour l'admin)
#   3. Page React : ProfilePage.jsx (profil user + profil admin)
#   4. Navigation : mise à jour de App.jsx pour inclure la route /profile
#
# Usage :
#   chmod +x setup-profile.sh
#   ./setup-profile.sh
#
# À lancer depuis la racine du repo (là où se trouvent client/ et server/)
# ═══════════════════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${GREEN}[✔]${NC} $1"; }
step() { echo -e "${BLUE}[→]${NC} $1"; }

CLIENT_DIR="client"
SERVER_DIR="server"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "   Setup Page Profil + Dashboard Admin — Chat App"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─────────────────────────────────────────────────────────────────
# 1. ROUTE API : Changer le mot de passe
#    À ajouter dans server/routes/auth.js
# ─────────────────────────────────────────────────────────────────
step "Création du patch pour auth.js (changement de mot de passe)..."
mkdir -p "$SERVER_DIR/patches"

cat > "$SERVER_DIR/patches/auth-change-password.js" << 'EOF'
/**
 * PATCH : Ajouter cette route dans server/routes/auth.js
 * juste avant "module.exports = router;"
 *
 * Elle permet à un utilisateur connecté de changer son mot de passe
 * en fournissant l'ancien (vérification bcrypt) et le nouveau.
 */

// PUT /api/auth/change-password
router.put('/change-password', authMiddleware, [
  body('currentPassword').notEmpty().withMessage('Mot de passe actuel requis'),
  body('newPassword').isLength({ min: 6 }).withMessage('Nouveau mot de passe : 6 caractères minimum'),
], validate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Vérifier l'ancien mot de passe
    const isValid = await req.user.comparePassword(currentPassword);
    if (!isValid) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }

    // Mettre à jour (le pre-save hook bcrypt hachera automatiquement)
    req.user.password = newPassword;
    await req.user.save();

    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
EOF
info "Patch auth créé → server/patches/auth-change-password.js"

# ─────────────────────────────────────────────────────────────────
# 2. ROUTE API : Stats globales pour l'admin
#    À ajouter dans server/routes/admin.js
# ─────────────────────────────────────────────────────────────────
step "Création du patch pour admin.js (statistiques globales)..."

cat > "$SERVER_DIR/patches/admin-stats.js" << 'EOF'
/**
 * PATCH : Ajouter cette route dans server/routes/admin.js
 * juste avant "module.exports = router;"
 *
 * Elle retourne des statistiques globales sur l'application,
 * visibles uniquement par les administrateurs.
 */

const Message = require('../models/Message'); // ajouter cet import en haut de admin.js

// GET /api/admin/stats — statistiques globales (admin uniquement)
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalUsers,
      onlineUsers,
      totalMessages,
      messagesToday,
      adminCount,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isOnline: true }),
      Message.countDocuments(),
      Message.countDocuments({ createdAt: { $gte: startOfDay } }),
      User.countDocuments({ role: 'admin' }),
    ]);

    res.json({
      totalUsers,
      onlineUsers,
      totalMessages,
      messagesToday,
      adminCount,
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
EOF
info "Patch admin créé → server/patches/admin-stats.js"

# ─────────────────────────────────────────────────────────────────
# 3. PAGE REACT : ProfilePage.jsx
# ─────────────────────────────────────────────────────────────────
step "Création de ProfilePage.jsx..."
mkdir -p "$CLIENT_DIR/src/pages"

cat > "$CLIENT_DIR/src/pages/ProfilePage.jsx" << 'EOF'
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ── Couleurs disponibles pour l'avatar ───────────────────────────
const AVATAR_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#f43f5e',
  '#14b8a6','#f59e0b','#10b981','#3b82f6',
];

// ── Utilitaire : formater une date ────────────────────────────────
const formatDate = (date) =>
  date ? new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

// ── Composant : Carte de statistique ─────────────────────────────
function StatCard({ icon, label, value, color = '#6366f1' }) {
  return (
    <div style={{
      background: '#1e1e3a', borderRadius: 12, padding: '16px 20px',
      display: 'flex', alignItems: 'center', gap: 14,
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: color + '22', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem',
      }}>
        {icon}
      </div>
      <div>
        <p style={{ color: '#9ca3af', fontSize: '0.78rem', margin: 0 }}>{label}</p>
        <p style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '1.2rem', margin: '2px 0 0' }}>
          {value ?? '…'}
        </p>
      </div>
    </div>
  );
}

// ── Composant : Section avec titre ───────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{
        color: '#9ca3af', fontSize: '0.78rem', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        margin: '0 0 12px', paddingBottom: 8,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────
export default function ProfilePage({ onBack }) {
  const { user, token, setUser } = useAuth();

  // États du formulaire profil
  const [bio, setBio] = useState(user?.bio || '');
  const [avatar, setAvatar] = useState(user?.avatar || '#6366f1');
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  // États changement de mot de passe
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState(null);

  // Stats admin
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Onglet actif
  const [tab, setTab] = useState('profile'); // profile | security | admin

  const isAdmin = user?.role === 'admin';

  // ── Charger les stats admin ─────────────────────────────────────
  const loadStats = useCallback(async () => {
    if (!isAdmin) return;
    setStatsLoading(true);
    try {
      const res = await fetch(`${API}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStats(await res.json());
    } catch {}
    setStatsLoading(false);
  }, [isAdmin, token]);

  useEffect(() => {
    if (tab === 'admin') loadStats();
  }, [tab, loadStats]);

  // ── Sauvegarder le profil ───────────────────────────────────────
  const saveProfile = async () => {
    setSaving(true);
    setProfileMsg(null);
    try {
      const res = await fetch(`${API}/auth/profile`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: bio.trim(), avatar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUser(data);
      setProfileMsg({ type: 'success', text: '✅ Profil mis à jour !' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: '❌ ' + err.message });
    }
    setSaving(false);
  };

  // ── Changer le mot de passe ─────────────────────────────────────
  const changePassword = async () => {
    setPwdMsg(null);
    if (newPassword !== confirmPassword) {
      setPwdMsg({ type: 'error', text: '❌ Les mots de passe ne correspondent pas' });
      return;
    }
    if (newPassword.length < 6) {
      setPwdMsg({ type: 'error', text: '❌ Minimum 6 caractères' });
      return;
    }
    setPwdSaving(true);
    try {
      const res = await fetch(`${API}/auth/change-password`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPwdMsg({ type: 'success', text: '✅ Mot de passe changé avec succès !' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwdMsg({ type: 'error', text: '❌ ' + err.message });
    }
    setPwdSaving(false);
  };

  // ── Styles ──────────────────────────────────────────────────────
  const s = {
    overlay: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: 16,
    },
    modal: {
      background: '#16162a', borderRadius: 20, width: '100%', maxWidth: 560,
      maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      border: '1px solid rgba(255,255,255,0.08)',
    },
    header: {
      padding: '20px 24px 0', display: 'flex',
      alignItems: 'center', justifyContent: 'space-between',
    },
    title: { color: '#f1f5f9', fontWeight: 700, fontSize: '1.15rem', margin: 0 },
    closeBtn: {
      background: 'rgba(255,255,255,0.08)', border: 'none', color: '#9ca3af',
      width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: '1rem',
    },
    tabs: {
      display: 'flex', gap: 4, padding: '16px 24px 0',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    },
    tab: (active) => ({
      padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none',
      background: active ? '#6366f1' : 'transparent',
      color: active ? '#fff' : '#9ca3af',
      cursor: 'pointer', fontSize: '0.88rem', fontWeight: active ? 600 : 400,
    }),
    body: { padding: '24px', overflowY: 'auto', flex: 1 },
    avatar: {
      width: 72, height: 72, borderRadius: '50%',
      background: avatar, display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: '#fff', fontWeight: 700,
      fontSize: '1.8rem', flexShrink: 0,
      border: '3px solid rgba(255,255,255,0.1)',
    },
    label: { color: '#9ca3af', fontSize: '0.82rem', marginBottom: 6, display: 'block' },
    input: {
      width: '100%', background: '#1e1e3a', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10, color: '#f1f5f9', padding: '10px 14px',
      fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
    },
    textarea: {
      width: '100%', background: '#1e1e3a', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10, color: '#f1f5f9', padding: '10px 14px',
      fontSize: '0.95rem', outline: 'none', resize: 'vertical',
      minHeight: 80, boxSizing: 'border-box', fontFamily: 'inherit',
    },
    btn: (color = '#6366f1') => ({
      background: color, border: 'none', borderRadius: 10, color: '#fff',
      padding: '10px 20px', cursor: 'pointer', fontWeight: 600,
      fontSize: '0.9rem', width: '100%', marginTop: 8,
    }),
    msg: (type) => ({
      padding: '10px 14px', borderRadius: 8, fontSize: '0.88rem',
      background: type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
      color: type === 'success' ? '#10b981' : '#ef4444',
      border: `1px solid ${type === 'success' ? '#10b981' : '#ef4444'}33`,
      marginTop: 10,
    }),
    colorGrid: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    colorBtn: (color, selected) => ({
      width: 32, height: 32, borderRadius: '50%', background: color,
      border: selected ? '3px solid #fff' : '3px solid transparent',
      cursor: 'pointer', outline: 'none',
      boxShadow: selected ? `0 0 0 2px ${color}` : 'none',
    }),
    statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
    badge: {
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'rgba(99,102,241,0.2)', color: '#a5b4fc',
      padding: '4px 12px', borderRadius: 20, fontSize: '0.82rem',
      fontWeight: 600, border: '1px solid rgba(99,102,241,0.4)',
    },
  };

  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onBack?.()}>
      <div style={s.modal}>

        {/* ── En-tête ─────────────────────────────────────────── */}
        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={s.avatar}>{user?.username?.[0]?.toUpperCase()}</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={s.title}>{user?.username}</h2>
                {isAdmin && <span style={s.badge}>👑 Admin</span>}
              </div>
              <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: '2px 0 0' }}>
                Membre depuis {formatDate(user?.createdAt)}
              </p>
            </div>
          </div>
          <button onClick={onBack} style={s.closeBtn}>✕</button>
        </div>

        {/* ── Onglets ─────────────────────────────────────────── */}
        <div style={s.tabs}>
          <button style={s.tab(tab === 'profile')} onClick={() => setTab('profile')}>
            👤 Profil
          </button>
          <button style={s.tab(tab === 'security')} onClick={() => setTab('security')}>
            🔒 Sécurité
          </button>
          {isAdmin && (
            <button style={s.tab(tab === 'admin')} onClick={() => setTab('admin')}>
              👑 Dashboard
            </button>
          )}
        </div>

        {/* ── Corps ───────────────────────────────────────────── */}
        <div style={s.body}>

          {/* ── Onglet Profil ──────────────────────────────── */}
          {tab === 'profile' && (
            <>
              <Section title="Informations générales">
                <div style={{ marginBottom: 16 }}>
                  <label style={s.label}>Nom d'utilisateur</label>
                  <input
                    value={user?.username}
                    disabled
                    style={{ ...s.input, opacity: 0.5, cursor: 'not-allowed' }}
                  />
                  <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 4 }}>
                    Le nom d'utilisateur ne peut pas être modifié.
                  </p>
                </div>

                <div>
                  <label style={s.label}>Bio <span style={{ color: '#6b7280' }}>({bio.length}/150)</span></label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 150))}
                    placeholder="Dites quelque chose sur vous..."
                    style={s.textarea}
                  />
                </div>
              </Section>

              <Section title="Couleur de l'avatar">
                <div style={s.colorGrid}>
                  {AVATAR_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setAvatar(color)}
                      style={s.colorBtn(color, avatar === color)}
                      title={color}
                    />
                  ))}
                </div>
              </Section>

              <Section title="Aperçu">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#1e1e3a', borderRadius: 12 }}>
                  <div style={{ ...s.avatar, width: 44, height: 44, fontSize: '1.1rem' }}>
                    {user?.username?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p style={{ color: '#f1f5f9', fontWeight: 600, margin: 0 }}>{user?.username}</p>
                    <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: '2px 0 0' }}>
                      {bio || 'Pas de bio'}
                    </p>
                  </div>
                  {isAdmin && <span style={{ ...s.badge, marginLeft: 'auto' }}>👑 Admin</span>}
                </div>
              </Section>

              <button
                onClick={saveProfile}
                disabled={saving}
                style={s.btn()}
              >
                {saving ? 'Sauvegarde...' : '💾 Sauvegarder les modifications'}
              </button>

              {profileMsg && <div style={s.msg(profileMsg.type)}>{profileMsg.text}</div>}
            </>
          )}

          {/* ── Onglet Sécurité ────────────────────────────── */}
          {tab === 'security' && (
            <>
              <Section title="Changer le mot de passe">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={s.label}>Mot de passe actuel</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      style={s.input}
                    />
                  </div>
                  <div>
                    <label style={s.label}>Nouveau mot de passe</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 caractères"
                      style={s.input}
                    />
                  </div>
                  <div>
                    <label style={s.label}>Confirmer le nouveau mot de passe</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      style={s.input}
                    />
                  </div>
                </div>

                <button
                  onClick={changePassword}
                  disabled={pwdSaving || !currentPassword || !newPassword || !confirmPassword}
                  style={s.btn('#ef4444')}
                >
                  {pwdSaving ? 'Modification...' : '🔑 Changer le mot de passe'}
                </button>

                {pwdMsg && <div style={s.msg(pwdMsg.type)}>{pwdMsg.text}</div>}
              </Section>

              <Section title="Informations du compte">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Rôle', value: isAdmin ? '👑 Administrateur' : '👤 Utilisateur' },
                    { label: 'Membre depuis', value: formatDate(user?.createdAt) },
                    { label: 'Dernière connexion', value: formatDate(user?.lastSeen) },
                    { label: 'Statut', value: user?.isOnline ? '🟢 En ligne' : '⚫ Hors ligne' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#1e1e3a', borderRadius: 8 }}>
                      <span style={{ color: '#9ca3af', fontSize: '0.88rem' }}>{label}</span>
                      <span style={{ color: '#f1f5f9', fontSize: '0.88rem', fontWeight: 500 }}>{value}</span>
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}

          {/* ── Onglet Dashboard Admin ─────────────────────── */}
          {tab === 'admin' && isAdmin && (
            <>
              <Section title="Statistiques globales de l'application">
                {statsLoading ? (
                  <p style={{ color: '#9ca3af', textAlign: 'center', padding: 20 }}>
                    Chargement des statistiques...
                  </p>
                ) : stats ? (
                  <div style={s.statsGrid}>
                    <StatCard icon="👥" label="Utilisateurs total" value={stats.totalUsers} color="#6366f1" />
                    <StatCard icon="🟢" label="En ligne maintenant" value={stats.onlineUsers} color="#10b981" />
                    <StatCard icon="💬" label="Messages total" value={stats.totalMessages} color="#f59e0b" />
                    <StatCard icon="📅" label="Messages aujourd'hui" value={stats.messagesToday} color="#ec4899" />
                    <StatCard icon="👑" label="Administrateurs" value={stats.adminCount} color="#8b5cf6" />
                    <StatCard icon="👤" label="Utilisateurs standard" value={stats.totalUsers - stats.adminCount} color="#14b8a6" />
                  </div>
                ) : (
                  <p style={{ color: '#ef4444' }}>Erreur lors du chargement des statistiques.</p>
                )}

                <button onClick={loadStats} style={{ ...s.btn('#4b5563'), marginTop: 16 }}>
                  🔄 Rafraîchir les statistiques
                </button>
              </Section>

              <Section title="Actions rapides">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>
                    Les actions de gestion des utilisateurs (changer les rôles, supprimer des comptes)
                    sont disponibles via l'API admin :
                  </p>
                  <code style={{ background: '#0f0f1a', color: '#a5b4fc', padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem' }}>
                    GET /api/admin/users
                  </code>
                  <code style={{ background: '#0f0f1a', color: '#a5b4fc', padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem' }}>
                    PATCH /api/admin/users/:id/role
                  </code>
                  <code style={{ background: '#0f0f1a', color: '#a5b4fc', padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem' }}>
                    DELETE /api/admin/users/:id
                  </code>
                  <p style={{ color: '#6b7280', fontSize: '0.78rem', margin: '4px 0 0' }}>
                    Générée le {stats ? new Date(stats.generatedAt).toLocaleTimeString('fr-FR') : '—'}
                  </p>
                </div>
              </Section>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
EOF
info "ProfilePage.jsx créé → client/src/pages/ProfilePage.jsx"

# ─────────────────────────────────────────────────────────────────
# 4. INSTRUCTIONS D'INTÉGRATION dans App.jsx et ChatPage.jsx
# ─────────────────────────────────────────────────────────────────
step "Création du guide d'intégration..."

cat > PROFILE_INTEGRATION.md << 'EOF'
# Intégration de la page Profil

## 1. Dans server/routes/auth.js
Ajoutez la route change-password AVANT "module.exports = router;" :
(voir le contenu dans server/patches/auth-change-password.js)

## 2. Dans server/routes/admin.js
Ajoutez en haut du fichier :
  const Message = require('../models/Message');

Puis ajoutez la route stats AVANT "module.exports = router;" :
(voir le contenu dans server/patches/admin-stats.js)

## 3. Dans AuthContext.jsx
Assurez-vous que la fonction "setUser" est bien exportée dans le context :

  const value = useMemo(() => ({
    user, token, login, register, logout,
    setUser,   // ← ajouter cette ligne si absente
  }), [user, token, login, register, logout, setUser]);

## 4. Dans ChatPage.jsx ou App.jsx
Importez et ouvrez ProfilePage depuis un bouton dans la barre de navigation :

  import { useState } from 'react';
  import ProfilePage from './ProfilePage';

  // Dans le composant :
  const [showProfile, setShowProfile] = useState(false);

  // Bouton pour ouvrir (dans la sidebar ou navbar) :
  <button onClick={() => setShowProfile(true)}>
    👤 Mon profil
  </button>

  // Modal profil :
  {showProfile && (
    <ProfilePage onBack={() => setShowProfile(false)} />
  )}

## 5. Commit
  git add .
  git commit -m "feat: page profil utilisateur + dashboard admin"
  git push
EOF
info "Guide d'intégration créé → PROFILE_INTEGRATION.md"

# ─────────────────────────────────────────────────────────────────
# RÉSUMÉ FINAL
# ─────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo -e "${GREEN}Page Profil générée avec succès !${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Fichiers créés :"
echo "  client/src/pages/ProfilePage.jsx          — Page profil complète"
echo "  server/patches/auth-change-password.js    — Route change-password"
echo "  server/patches/admin-stats.js             — Route statistiques admin"
echo "  PROFILE_INTEGRATION.md                   — Guide d'intégration"
echo ""
echo "La page profil contient 3 onglets :"
echo "  👤 Profil   — modifier bio + couleur avatar + aperçu"
echo "  🔒 Sécurité — changer mot de passe + infos du compte"
echo "  👑 Dashboard — statistiques globales (admin uniquement)"
echo ""
echo "Suivez les instructions dans PROFILE_INTEGRATION.md"
echo "pour brancher les routes API et le bouton d'ouverture."
echo "═══════════════════════════════════════════════════════════════"