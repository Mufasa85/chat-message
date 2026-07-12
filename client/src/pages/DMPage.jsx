import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const formatTime = (d) => d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
const formatDate = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === yesterday.toDateString()) return 'Hier';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
};

const STATUS_COLORS = { online: '#10b981', busy: '#f59e0b', invisible: '#6b7280', offline: '#6b7280' };

const formatBytes = (b) => { if (!b) return ''; if (b < 1024) return `${b} o`; if (b < 1024**2) return `${(b/1024).toFixed(1)} Ko`; return `${(b/1024**2).toFixed(1)} Mo`; };
const fileIcon = (f) => ({ pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',zip:'📦',txt:'🗒️',mp3:'🎵',wav:'🎵',mp4:'🎬',mov:'🎬' }[f?.toLowerCase()] || '📎');
const toDownloadUrl = (url, filename) => { if (!url || !url.includes('cloudinary.com')) return url; const safe = (filename||'fichier').replace(/[^a-zA-Z0-9._-]/g,'_'); return url.replace('/upload/',`/upload/fl_attachment:${safe}/`); };

const Ic = {
  send:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  back:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  close:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  search: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  msg:    () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  plus:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  phone:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.4a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.69h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.09a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  video:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>,
  attach: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>,
  mic:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  stop:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
};

function Avatar({ user, size = 36 }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: user?.avatar || '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.38 }}>
        {user?.username?.[0]?.toUpperCase()}
      </div>
      <span style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.28, height: size * 0.28, borderRadius: '50%', background: STATUS_COLORS[user?.status] || '#6b7280', border: '2px solid #1e1f22' }} />
    </div>
  );
}

export default function DMPage({ onClose, initialUser = null }) {
  const { token, user: me } = useAuth();
  const { emit, webrtc } = useChat();
  const [view, setView] = useState(initialUser ? 'chat' : 'list');
  const [conversations, setConversations] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [activeUser, setActiveUser] = useState(initialUser);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const activeUserRef = useRef(activeUser);
  activeUserRef.current = activeUser;

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadConversations = useCallback(async () => {
    try {
      const r = await fetch(`${API}/dm/conversations`, { headers: authHeaders });
      if (r.ok) setConversations(await r.json());
    } catch {}
  }, [token]);

  const loadUsers = useCallback(async () => {
    try {
      const r = await fetch(`${API}/dm/users/list`, { headers: authHeaders });
      if (r.ok) setUsers(await r.json());
    } catch {}
  }, [token]);

  const loadMessages = useCallback(async (userId) => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/dm/${userId}`, { headers: authHeaders });
      if (r.ok) setMessages(await r.json());
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { loadConversations(); loadUsers(); }, [loadConversations, loadUsers]);
  useEffect(() => { if (activeUser) loadMessages(activeUser._id); }, [activeUser]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Écouter new_dm via un polling sur le contexte (emit expose le WS indirectement)
  // On utilise une approche REST polling léger toutes les 3s si pas de WS direct
  useEffect(() => {
    if (!activeUser) return;
    const interval = setInterval(() => loadMessages(activeUserRef.current?._id), 3000);
    return () => clearInterval(interval);
  }, [activeUser, loadMessages]);

  const openConv = (u) => { setActiveUser(u); setView('chat'); };

  const addOptimistic = (msg) => setMessages(prev => [...prev, { _id: Date.now(), from: me, to: activeUser, createdAt: new Date().toISOString(), ...msg }]);

  const sendDM = () => {
    if (!text.trim() || !activeUser) return;
    emit('send_dm', { toUserId: activeUser._id, content: text.trim() });
    addOptimistic({ content: text.trim(), type: 'text' });
    loadConversations();
    setText('');
    inputRef.current?.focus();
  };

  // Upload fichier
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeUser) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('roomId', 'dm'); // placeholder, le serveur l'ignorera pour les DM
      const r = await fetch(`${API}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (r.ok) {
        const saved = await r.json();
        const att = saved.attachment;
        const msgType = saved.type || 'file';
        emit('send_dm', { toUserId: activeUser._id, content: '', type: msgType, attachment: att });
        addOptimistic({ content: '', type: msgType, attachment: att });
        loadConversations();
      }
    } catch {}
    setUploading(false);
    e.target.value = '';
  };

  // Enregistrement vocal
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const fd = new FormData();
        fd.append('file', blob, 'vocal.webm');
        fd.append('roomId', 'dm');
        setUploading(true);
        try {
          const r = await fetch(`${API}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
          if (r.ok) {
            const saved = await r.json();
            emit('send_dm', { toUserId: activeUserRef.current._id, content: '', type: 'audio', attachment: saved.attachment });
            addOptimistic({ content: '', type: 'audio', attachment: saved.attachment });
            loadConversations();
          }
        } catch {}
        setUploading(false);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {}
  };

  const stopRecording = () => { mediaRef.current?.stop(); setRecording(false); };

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  // ── Styles ──────────────────────────────────────────────────────
  const s = {
    overlay:  { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 250 },
    panel:    { background: '#1e1f22', width: '100%', maxWidth: 480, height: '88vh', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,0.6)' },
    header:   { background: '#2b2d31', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 },
    title:    { color: '#f1f5f9', fontWeight: 700, fontSize: '0.95rem', flex: 1, margin: 0 },
    iconBtn:  { background: 'rgba(255,255,255,0.07)', border: 'none', color: '#9ca3af', width: 30, height: 30, borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    body:     { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' },
    convItem: (active) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: active ? 'rgba(99,102,241,0.12)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }),
    msgBubble:(fromMe) => ({ maxWidth: '72%', padding: '8px 12px', borderRadius: fromMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: fromMe ? '#5865f2' : '#2b2d31', color: '#f1f5f9', fontSize: '0.88rem', lineHeight: 1.45, overflowWrap: 'break-word', wordBreak: 'normal' }),
    input:    { flex: 1, background: '#383a40', border: 'none', borderRadius: 10, color: '#f1f5f9', padding: '10px 14px', fontSize: '0.9rem', outline: 'none' },
    sendBtn:  { background: '#5865f2', border: 'none', borderRadius: 10, color: '#fff', padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  };

  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.panel}>

        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* Header */}
        <div style={s.header}>
          {view !== 'list' && (
            <button style={s.iconBtn} onClick={() => { setView('list'); setActiveUser(null); setMessages([]); }}>
              <Ic.back />
            </button>
          )}
          {view === 'list' && <div style={{ color: '#5865f2' }}><Ic.msg /></div>}
          {view === 'chat' && activeUser && <Avatar user={activeUser} size={30} />}
          <p style={s.title}>
            {view === 'list' && 'Messages privés'}
            {view === 'new'  && 'Nouvelle conversation'}
            {view === 'chat' && activeUser?.username}
          </p>
          {view === 'list' && (
            <button style={s.iconBtn} onClick={() => setView('new')} title="Nouveau message">
              <Ic.plus />
            </button>
          )}
          {view === 'chat' && activeUser && (<>
            <button style={s.iconBtn} title="Appel vocal" onClick={() => webrtc?.startCall({ userId: activeUser._id, username: activeUser.username, avatar: activeUser.avatar }, 'audio')}><Ic.phone /></button>
            <button style={s.iconBtn} title="Appel vidéo" onClick={() => webrtc?.startCall({ userId: activeUser._id, username: activeUser.username, avatar: activeUser.avatar }, 'video')}><Ic.video /></button>
          </>)}
          <button style={s.iconBtn} onClick={onClose}><Ic.close /></button>
        </div>

        {/* ── VUE LISTE ── */}
        {view === 'list' && (
          <div style={s.body}>
            {conversations.length === 0 && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#4b5563', gap: 10 }}>
                <Ic.msg />
                <p style={{ margin: 0, fontSize: '0.88rem' }}>Aucune conversation</p>
                <button onClick={() => setView('new')} style={{ background: '#5865f2', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 16px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  Démarrer une conversation
                </button>
              </div>
            )}
            {conversations.map(({ user: u, lastMessage, unread }) => (
              <div key={u._id} style={s.convItem(activeUser?._id === u._id)} onClick={() => openConv(u)}>
                <Avatar user={u} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '0.88rem' }}>{u.username}</span>
                    <span style={{ color: '#6b7280', fontSize: '0.72rem' }}>{formatTime(lastMessage?.createdAt)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                    <span style={{ color: '#9ca3af', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                      {lastMessage?.fromMe ? 'Vous : ' : ''}{lastMessage?.content || '📎 Fichier'}
                    </span>
                    {unread > 0 && (
                      <span style={{ background: '#5865f2', color: '#fff', borderRadius: 10, fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', flexShrink: 0 }}>{unread}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── VUE NOUVEAU MESSAGE ── */}
        {view === 'new' && (
          <div style={s.body}>
            <div style={{ padding: '10px 14px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2b2d31', borderRadius: 9, padding: '7px 12px' }}>
                <Ic.search />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un utilisateur..."
                  style={{ background: 'transparent', border: 'none', color: '#f1f5f9', outline: 'none', flex: 1, fontSize: '0.88rem' }}
                />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredUsers.map(u => (
                <div key={u._id} style={s.convItem(false)} onClick={() => openConv(u)}>
                  <Avatar user={u} size={38} />
                  <div>
                    <p style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '0.88rem', margin: 0 }}>{u.username}</p>
                    <p style={{ color: STATUS_COLORS[u.status] || '#6b7280', fontSize: '0.75rem', margin: '2px 0 0' }}>
                      {{ online: 'En ligne', busy: 'Occupé', invisible: 'Invisible', offline: 'Hors ligne' }[u.status] || 'Hors ligne'}
                    </p>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 && (
                <p style={{ color: '#4b5563', textAlign: 'center', padding: 24, fontSize: '0.85rem' }}>Aucun utilisateur trouvé</p>
              )}
            </div>
          </div>
        )}

        {/* ── VUE CHAT ── */}
        {view === 'chat' && activeUser && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {loading && <p style={{ color: '#6b7280', textAlign: 'center', fontSize: '0.82rem' }}>Chargement...</p>}
              {messages.map((m, i) => {
                const fromMe = String(m.from?._id) === String(me._id);
                const att = m.attachment;
                const showDate = i === 0 || formatDate(m.createdAt) !== formatDate(messages[i - 1]?.createdAt);
                return (
                  <div key={m._id}>
                    {showDate && (
                      <div style={{ textAlign: 'center', margin: '8px 0' }}>
                        <span style={{ color: '#4b5563', fontSize: '0.72rem', background: '#2b2d31', padding: '3px 10px', borderRadius: 10 }}>{formatDate(m.createdAt)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: fromMe ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
                      {!fromMe && <div style={{ marginRight: 6, alignSelf: 'flex-end' }}><Avatar user={activeUser} size={24} /></div>}
                      <div style={{ maxWidth: '75%' }}>
                        {/* Image */}
                        {m.type === 'image' && att && (
                          <a href={att.secureUrl || att.url} target="_blank" rel="noreferrer">
                            <img src={att.secureUrl || att.url} alt={att.filename || 'image'} style={{ maxWidth: 220, borderRadius: 10, display: 'block' }} />
                          </a>
                        )}
                        {/* Audio */}
                        {m.type === 'audio' && att && (
                          <div style={{ ...s.msgBubble(fromMe), padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, minWidth: 220, maxWidth: 300 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.65 }}>
                              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                              <line x1="12" y1="19" x2="12" y2="23"/>
                              <line x1="8" y1="23" x2="16" y2="23"/>
                            </svg>
                            <audio src={att.secureUrl || att.url} controls style={{ flex: 1, height: 32, minWidth: 0 }} />
                          </div>
                        )}
                        {/* Fichier */}
                        {m.type === 'file' && att && (
                          <a href={toDownloadUrl(att.secureUrl || att.url, att.filename)} download={att.filename} target="_blank" rel="noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: fromMe ? '#5865f2' : '#2b2d31', borderRadius: 10, textDecoration: 'none', color: '#f1f5f9', minWidth: 160 }}>
                            <span style={{ fontSize: '1.5rem' }}>{fileIcon(att.format)}</span>
                            <div><p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600 }}>{att.filename}</p><p style={{ margin: 0, fontSize: '0.7rem', color: '#9ca3af' }}>{formatBytes(att.bytes)}</p></div>
                            <span style={{ marginLeft: 'auto' }}>⬇</span>
                          </a>
                        )}
                        {/* Texte */}
                        {(m.type === 'text' || !m.type) && m.content && (
                          <div style={s.msgBubble(fromMe)}>{m.content}</div>
                        )}
                        <div style={{ color: '#4b5563', fontSize: '0.68rem', textAlign: fromMe ? 'right' : 'left', marginTop: 2, paddingRight: 4 }}>
                          {formatTime(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            {/* Input toolbar */}
            <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              {uploading && <p style={{ color: '#9ca3af', fontSize: '0.75rem', margin: '0 0 6px' }}>Envoi en cours...</p>}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {/* Attach */}
                <button onClick={() => fileRef.current?.click()} title="Joindre un fichier"
                  style={{ ...s.iconBtn, flexShrink: 0 }}>
                  <Ic.attach />
                </button>
                <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleFileChange}
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" />
                {/* Micro */}
                <button
                  onClick={recording ? stopRecording : startRecording}
                  title={recording ? 'Arrêter' : 'Message vocal'}
                  style={{ ...s.iconBtn, flexShrink: 0, color: recording ? '#ef4444' : '#9ca3af', background: recording ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.07)' }}>
                  {recording ? <Ic.stop /> : <Ic.mic />}
                </button>
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDM(); } }}
                  placeholder={recording ? '🎤 Enregistrement...' : `Message à ${activeUser.username}...`}
                  disabled={recording}
                  style={{ ...s.input, opacity: recording ? 0.5 : 1 }}
                />
                <button onClick={sendDM} disabled={!text.trim() || recording} style={{ ...s.sendBtn, opacity: (text.trim() && !recording) ? 1 : 0.4, flexShrink: 0 }}>
                  <Ic.send />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
