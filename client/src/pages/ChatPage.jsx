import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';

const s = {
  layout:         { display: 'flex', height: '100vh', background: '#0f0f1a', fontFamily: 'system-ui, sans-serif' },
  sidebar:        { width: 240, background: '#1a1a2e', display: 'flex', flexDirection: 'column', borderRight: '1px solid #2d2d4e' },
  sidebarHeader:  { padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2d2d4e' },
  addBtn:         { background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', width: 28, height: 28, cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 },
  roomItem:       { padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, margin: '2px 8px' },
  roomItemActive: { background: '#2d2d4e' },
  roomHash:       { color: '#6366f1', fontWeight: 700 },
  main:           { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header:         { padding: '0 1.5rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #2d2d4e', background: '#1a1a2e' },
  dot:            { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginLeft: 8 },
  messages:       { flex: 1, overflowY: 'auto', padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 8 },
  empty:          { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  msgRow:         { display: 'flex', alignItems: 'flex-end', gap: 8 },
  avatar:         { width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 },
  msgAuthor:      { color: '#9ca3af', fontSize: '0.78rem', margin: '0 0 3px 4px' },
  bubble:         { padding: '10px 14px', borderRadius: 14, fontSize: '0.95rem', lineHeight: 1.5, wordBreak: 'break-word' },
  bubbleOwn:      { background: '#6366f1', color: '#fff', borderBottomRightRadius: 4 },
  bubbleOther:    { background: '#2d2d4e', color: '#e2e8f0', borderBottomLeftRadius: 4 },
  msgTime:        { color: '#6b7280', fontSize: '0.72rem', margin: '2px 4px 0' },
  inputArea:      { padding: '1rem 1.5rem', display: 'flex', gap: 12, borderTop: '1px solid #2d2d4e', background: '#1a1a2e' },
  textarea:       { flex: 1, padding: '12px 16px', borderRadius: 12, border: '1px solid #2d2d4e', background: '#0f0f1a', color: '#fff', fontSize: '0.95rem', resize: 'none', outline: 'none', fontFamily: 'inherit' },
  sendBtn:        { padding: '10px 18px', borderRadius: 12, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '1rem' },
  logoutBtn:      { padding: '6px 14px', borderRadius: 8, border: '1px solid #2d2d4e', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: '0.85rem' },
  userList:       { width: 200, background: '#1a1a2e', padding: '1rem', borderLeft: '1px solid #2d2d4e', overflowY: 'auto' },
  modal:          { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard:      { background: '#1a1a2e', padding: '2rem', borderRadius: 16, width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
  modalInput:     { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #2d2d4e', background: '#0f0f1a', color: '#fff', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' },
};

function MessageBubble({ msg, isOwn }) {
  return (
    <div style={{ ...s.msgRow, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
      {!isOwn && <div style={{ ...s.avatar, background: msg.author?.avatar || '#6366f1' }}>{msg.author?.username?.[0]?.toUpperCase()}</div>}
      <div style={{ maxWidth: '65%' }}>
        {!isOwn && <p style={s.msgAuthor}>{msg.author?.username}</p>}
        <div style={{ ...s.bubble, ...(isOwn ? s.bubbleOwn : s.bubbleOther) }}>{msg.content}</div>
        <p style={{ ...s.msgTime, textAlign: isOwn ? 'right' : 'left' }}>
          {new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      {isOwn && <div style={{ ...s.avatar, background: '#6366f1', marginLeft: 8, marginRight: 0 }}>{msg.author?.username?.[0]?.toUpperCase()}</div>}
    </div>
  );
}

function MessageInput() {
  const { sendMessage, sendTyping, currentRoom } = useChat();
  const [text, setText] = useState('');
  const timer = useRef(null);

  const handleChange = (e) => {
    setText(e.target.value); sendTyping(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => sendTyping(false), 1500);
  };

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage(text); setText('');
    clearTimeout(timer.current); sendTyping(false);
  };

  return (
    <div style={s.inputArea}>
      <textarea
        style={s.textarea}
        placeholder={currentRoom ? `Message #${currentRoom.name}` : 'Rejoins un salon...'}
        value={text} onChange={handleChange}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        disabled={!currentRoom} rows={1}
      />
      <button style={s.sendBtn} onClick={handleSend} disabled={!currentRoom || !text.trim()}>➤</button>
    </div>
  );
}

export default function ChatPage() {
  const { user, logout } = useAuth();
  const { messages, currentRoom, onlineUsers, typingUsers, connected, rooms, joinRoom, fetchRooms, createRoom } = useChat();
  const [showCreate,   setShowCreate]   = useState(false);
  const [newRoomName,  setNewRoomName]  = useState('');
  const bottomRef = useRef(null);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleCreate = async () => {
    if (!newRoomName.trim()) return;
    try { const room = await createRoom(newRoomName.trim()); setShowCreate(false); setNewRoomName(''); joinRoom(room); }
    catch (err) { alert(err.message); }
  };

  return (
    <div style={s.layout}>
      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.sidebarHeader}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>💬 Salons</span>
          <button style={s.addBtn} onClick={() => setShowCreate(true)}>+</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {rooms.map((room) => (
            <div key={room._id} style={{ ...s.roomItem, ...(currentRoom?._id === room._id ? s.roomItemActive : {}) }} onClick={() => joinRoom(room)}>
              <span style={s.roomHash}>#</span>
              <span style={{ color: '#e2e8f0', fontSize: '0.95rem' }}>{room.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Zone principale */}
      <div style={s.main}>
        <div style={s.header}>
          <div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>
              {currentRoom ? `# ${currentRoom.name}` : 'Sélectionne un salon'}
            </span>
            <span style={{ ...s.dot, background: connected ? '#22c55e' : '#ef4444' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>@{user?.username}</span>
            <button style={s.logoutBtn} onClick={logout}>Déconnexion</button>
          </div>
        </div>

        <div style={s.messages}>
          {!currentRoom && (
            <div style={s.empty}>
              <p style={{ fontSize: '3rem' }}>💬</p>
              <p style={{ color: '#9ca3af' }}>Rejoins un salon pour commencer à chatter</p>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg._id} msg={msg} isOwn={msg.author?._id === user?._id || msg.author === user?._id} />
          ))}
          {typingUsers.length > 0 && (
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0 1rem', fontStyle: 'italic' }}>
              {typingUsers.map((u) => u.username).join(', ')} est en train d'écrire...
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        <MessageInput />
      </div>

      {/* Utilisateurs en ligne */}
      {currentRoom && (
        <div style={s.userList}>
          <p style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', margin: '0 0 12px' }}>
            En ligne — {onlineUsers.length}
          </p>
          {onlineUsers.map((u) => (
            <div key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ ...s.avatar, width: 28, height: 28, fontSize: '0.75rem', background: u.avatar || '#6366f1' }}>
                {u.username?.[0]?.toUpperCase()}
              </div>
              <span style={{ color: '#e2e8f0', fontSize: '0.9rem' }}>{u.username}</span>
            </div>
          ))}
        </div>
      )}

      {/* Modal création de salon */}
      {showCreate && (
        <div style={s.modal}>
          <div style={s.modalCard}>
            <h3 style={{ color: '#fff', margin: '0 0 1rem' }}>Créer un salon</h3>
            <input style={s.modalInput} placeholder="Nom du salon" value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()} autoFocus />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button style={s.sendBtn} onClick={handleCreate}>Créer</button>
              <button style={s.logoutBtn} onClick={() => setShowCreate(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}