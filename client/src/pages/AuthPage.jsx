import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const s = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f1a' },
  card:   { background: '#1a1a2e', padding: '2.5rem', borderRadius: '16px', width: '360px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
  title:  { color: '#fff', textAlign: 'center', margin: '0 0 4px', fontSize: '2rem' },
  sub:    { color: '#9ca3af', textAlign: 'center', margin: '0 0 2rem', fontSize: '0.95rem' },
  form:   { display: 'flex', flexDirection: 'column', gap: '12px' },
  input:  { padding: '12px 16px', borderRadius: '10px', border: '1px solid #2d2d4e', background: '#0f0f1a', color: '#fff', fontSize: '0.95rem', outline: 'none' },
  error:  { color: '#f87171', fontSize: '0.85rem', margin: 0 },
  btn:    { padding: '12px', borderRadius: '10px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' },
  toggle: { marginTop: '1.5rem', background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', width: '100%', fontSize: '0.9rem' },
};

export default function AuthPage() {
  const { login, register } = useAuth();
  const [isLogin,  setIsLogin]  = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { if (isLogin) await login(username, password); else await register(username, password); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={s.container}>
      <div style={s.card}>
        <h1 style={s.title}>💬 ChatApp</h1>
        <p style={s.sub}>{isLogin ? 'Connexion' : 'Créer un compte'}</p>
        <form onSubmit={handleSubmit} style={s.form}>
          <input style={s.input} placeholder="Nom d'utilisateur" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={2} />
          <input style={s.input} type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          {error && <p style={s.error}>{error}</p>}
          <button style={s.btn} type="submit" disabled={loading}>{loading ? '...' : isLogin ? 'Se connecter' : "S'inscrire"}</button>
        </form>
        <button style={s.toggle} onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? "Pas de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
        </button>
      </div>
    </div>
  );
}