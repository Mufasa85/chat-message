import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';
import './index.css'

function SplashScreen({ onDone }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFadeOut(true), 1600);
    const t2 = setTimeout(() => onDone(), 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 24,
      transition: 'opacity 0.5s ease',
      opacity: fadeOut ? 0 : 1,
      pointerEvents: fadeOut ? 'none' : 'all',
    }}>
      {/* Logo */}
      <div style={{
        width: 80, height: 80, borderRadius: 24,
        background: 'linear-gradient(135deg, #6366f1, #a855f7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 40px rgba(99,102,241,0.5)',
        animation: 'splashPulse 1s ease-in-out infinite alternate',
      }}>
        <svg width="44" height="44" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
        </svg>
      </div>

      {/* Nom */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: '#fff', fontSize: '2rem', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
          Arcane Chat
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', margin: '6px 0 0' }}>
          Chargement en cours...
        </p>
      </div>

      {/* Spinner */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid rgba(255,255,255,0.15)',
        borderTop: '3px solid #a855f7',
        animation: 'splashSpin 0.8s linear infinite',
      }} />

      <style>{`
        @keyframes splashPulse {
          from { box-shadow: 0 0 30px rgba(99,102,241,0.4); transform: scale(1); }
          to   { box-shadow: 0 0 60px rgba(168,85,247,0.7); transform: scale(1.06); }
        }
        @keyframes splashSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function Inner() {
  const { token } = useAuth();
  if (!token) return <AuthPage />;
  return (
    <ChatProvider>
      <ChatPage />
    </ChatProvider>
  );
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <AuthProvider>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      {splashDone && <Inner />}
    </AuthProvider>
  );
}
