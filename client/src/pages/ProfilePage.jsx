import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const IcUser    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IcShield  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IcCrown   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20h20M5 20V10l7-7 7 7v10"/><polyline points="5 10 12 3 19 10"/></svg>;
const IcSave    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;
const IcKey     = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>;
const IcRefresh = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
const IcUsers   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IcOnline  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5" stroke="#10b981"/></svg>;
const IcMsg     = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const IcCalendar= () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;

const AVATAR_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#f43f5e',
  '#14b8a6','#f59e0b','#10b981','#3b82f6',
];

const formatDate = (date) =>
  date ? new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

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

export default function ProfilePage({ onBack }) {
  const { user, token, setUser } = useAuth();

  const [bio, setBio] = useState(user?.bio || '');
  const [avatar, setAvatar] = useState(user?.avatar || '#6366f1');
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState(null);

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [tab, setTab] = useState('profile');

  const isAdmin = user?.role === 'admin';

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
      setProfileMsg({ type: 'success', text: 'Profil mis à jour !' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.message });
    }
    setSaving(false);
  };

  const changePassword = async () => {
    setPwdMsg(null);
    if (newPassword !== confirmPassword) {
      setPwdMsg({ type: 'error', text: 'Les mots de passe ne correspondent pas' });
      return;
    }
    if (newPassword.length < 6) {
      setPwdMsg({ type: 'error', text: 'Minimum 6 caractères' });
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
      setPwdMsg({ type: 'success', text: 'Mot de passe changé avec succès !' });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      setPwdMsg({ type: 'error', text: err.message });
    }
    setPwdSaving(false);
  };

  const s = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 },
    modal: { background: '#16162a', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.08)' },
    header: { padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: '#f1f5f9', fontWeight: 700, fontSize: '1.15rem', margin: 0 },
    closeBtn: { background: 'rgba(255,255,255,0.08)', border: 'none', color: '#9ca3af', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: '1rem' },
    tabs: { display: 'flex', gap: 4, padding: '16px 24px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
    tab: (active) => ({ padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', background: active ? '#6366f1' : 'transparent', color: active ? '#fff' : '#9ca3af', cursor: 'pointer', fontSize: '0.88rem', fontWeight: active ? 600 : 400 }),
    body: { padding: '24px', overflowY: 'auto', flex: 1 },
    av: { width: 72, height: 72, borderRadius: '50%', background: avatar, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1.8rem', flexShrink: 0, border: '3px solid rgba(255,255,255,0.1)' },
    label: { color: '#9ca3af', fontSize: '0.82rem', marginBottom: 6, display: 'block' },
    input: { width: '100%', background: '#1e1e3a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#f1f5f9', padding: '10px 14px', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' },
    textarea: { width: '100%', background: '#1e1e3a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#f1f5f9', padding: '10px 14px', fontSize: '0.95rem', outline: 'none', resize: 'vertical', minHeight: 80, boxSizing: 'border-box', fontFamily: 'inherit' },
    btn: (color = '#6366f1') => ({ background: color, border: 'none', borderRadius: 10, color: '#fff', padding: '10px 20px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', width: '100%', marginTop: 8 }),
    msg: (type) => ({ padding: '10px 14px', borderRadius: 8, fontSize: '0.88rem', background: type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: type === 'success' ? '#10b981' : '#ef4444', border: `1px solid ${type === 'success' ? '#10b981' : '#ef4444'}33`, marginTop: 10 }),
    colorGrid: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    colorBtn: (color, selected) => ({ width: 32, height: 32, borderRadius: '50%', background: color, border: selected ? '3px solid #fff' : '3px solid transparent', cursor: 'pointer', outline: 'none', boxShadow: selected ? `0 0 0 2px ${color}` : 'none' }),
    statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
    badge: { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', padding: '4px 12px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600, border: '1px solid rgba(99,102,241,0.4)' },
  };

  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onBack?.()}>
      <div style={s.modal}>

        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={s.av}>{user?.username?.[0]?.toUpperCase()}</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={s.title}>{user?.username}</h2>
                {isAdmin && <span style={s.badge}><IcCrown /> Admin</span>}
              </div>
              <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: '2px 0 0' }}>
                Membre depuis {formatDate(user?.createdAt)}
              </p>
            </div>
          </div>
          <button onClick={onBack} style={s.closeBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={s.tabs}>
          <button style={{ ...s.tab(tab === 'profile'), display:'flex', alignItems:'center', gap:6 }} onClick={() => setTab('profile')}><IcUser /> Profil</button>
          <button style={{ ...s.tab(tab === 'security'), display:'flex', alignItems:'center', gap:6 }} onClick={() => setTab('security')}><IcShield /> Sécurité</button>
          {isAdmin && (
            <button style={{ ...s.tab(tab === 'admin'), display:'flex', alignItems:'center', gap:6 }} onClick={() => setTab('admin')}><IcCrown /> Dashboard</button>
          )}
        </div>

        <div style={s.body}>

          {tab === 'profile' && (
            <>
              <Section title="Informations générales">
                <div style={{ marginBottom: 16 }}>
                  <label style={s.label}>Nom d'utilisateur</label>
                  <input value={user?.username} disabled style={{ ...s.input, opacity: 0.5, cursor: 'not-allowed' }} />
                  <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 4 }}>Le nom d'utilisateur ne peut pas être modifié.</p>
                </div>
                <div>
                  <label style={s.label}>Bio <span style={{ color: '#6b7280' }}>({bio.length}/150)</span></label>
                  <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 150))} placeholder="Dites quelque chose sur vous..." style={s.textarea} />
                </div>
              </Section>

              <Section title="Couleur de l'avatar">
                <div style={s.colorGrid}>
                  {AVATAR_COLORS.map((color) => (
                    <button key={color} onClick={() => setAvatar(color)} style={s.colorBtn(color, avatar === color)} title={color} />
                  ))}
                </div>
              </Section>

              <Section title="Aperçu">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#1e1e3a', borderRadius: 12 }}>
                  <div style={{ ...s.av, width: 44, height: 44, fontSize: '1.1rem' }}>{user?.username?.[0]?.toUpperCase()}</div>
                  <div>
                    <p style={{ color: '#f1f5f9', fontWeight: 600, margin: 0 }}>{user?.username}</p>
                    <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: '2px 0 0' }}>{bio || 'Pas de bio'}</p>
                  </div>
                  {isAdmin && <span style={{ ...s.badge, marginLeft: 'auto' }}><IcCrown /> Admin</span>}
                </div>
              </Section>

              <button onClick={saveProfile} disabled={saving} style={s.btn()}>
                {saving ? 'Sauvegarde...' : <span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><IcSave /> Sauvegarder les modifications</span>}
              </button>
              {profileMsg && <div style={s.msg(profileMsg.type)}>{profileMsg.text}</div>}
            </>
          )}

          {tab === 'security' && (
            <>
              <Section title="Changer le mot de passe">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={s.label}>Mot de passe actuel</label>
                    <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" style={s.input} />
                  </div>
                  <div>
                    <label style={s.label}>Nouveau mot de passe</label>
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimum 6 caractères" style={s.input} />
                  </div>
                  <div>
                    <label style={s.label}>Confirmer le nouveau mot de passe</label>
                    <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" style={s.input} />
                  </div>
                </div>
                <button onClick={changePassword} disabled={pwdSaving || !currentPassword || !newPassword || !confirmPassword} style={s.btn('#ef4444')}>
                  {pwdSaving ? 'Modification...' : <span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><IcKey /> Changer le mot de passe</span>}
                </button>
                {pwdMsg && <div style={s.msg(pwdMsg.type)}>{pwdMsg.text}</div>}
              </Section>

              <Section title="Informations du compte">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Rôle', value: isAdmin ? 'Administrateur' : 'Utilisateur' },
                    { label: 'Membre depuis', value: formatDate(user?.createdAt) },
                    { label: 'Dernière connexion', value: formatDate(user?.lastSeen) },
                    { label: 'Statut', value: user?.isOnline ? 'En ligne' : 'Hors ligne' },
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

          {tab === 'admin' && isAdmin && (
            <>
              <Section title="Statistiques globales de l'application">
                {statsLoading ? (
                  <p style={{ color: '#9ca3af', textAlign: 'center', padding: 20 }}>Chargement des statistiques...</p>
                ) : stats ? (
                  <div style={s.statsGrid}>
                    <StatCard icon={<IcUsers />} label="Utilisateurs total" value={stats.totalUsers} color="#6366f1" />
                    <StatCard icon={<IcOnline />} label="En ligne maintenant" value={stats.onlineUsers} color="#10b981" />
                    <StatCard icon={<IcMsg />} label="Messages total" value={stats.totalMessages} color="#f59e0b" />
                    <StatCard icon={<IcCalendar />} label="Messages aujourd'hui" value={stats.messagesToday} color="#ec4899" />
                    <StatCard icon={<IcCrown />} label="Administrateurs" value={stats.adminCount} color="#8b5cf6" />
                    <StatCard icon={<IcUser />} label="Utilisateurs standard" value={stats.totalUsers - stats.adminCount} color="#14b8a6" />
                  </div>
                ) : (
                  <p style={{ color: '#ef4444' }}>Erreur lors du chargement des statistiques.</p>
                )}
                <button onClick={loadStats} style={{ ...s.btn('#4b5563'), marginTop: 16, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}><IcRefresh /> Rafraîchir</button>
              </Section>

              <Section title="Actions rapides">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>Gestion via l'API admin :</p>
                  {['GET /api/admin/users', 'PATCH /api/admin/users/:id/role', 'DELETE /api/admin/users/:id'].map((r) => (
                    <code key={r} style={{ background: '#0f0f1a', color: '#a5b4fc', padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem' }}>{r}</code>
                  ))}
                  <p style={{ color: '#6b7280', fontSize: '0.78rem', margin: '4px 0 0' }}>
                    Généré le {stats ? new Date(stats.generatedAt).toLocaleTimeString('fr-FR') : '—'}
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
