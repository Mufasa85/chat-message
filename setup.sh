#!/usr/bin/env bash
# =============================================================================
#  setup.sh — Génère l'application chat WebSocket + MongoDB
#  Usage : bash setup.sh
# =============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${BLUE}[chat-app]${NC} $1"; }
ok()   { echo -e "${GREEN}✔${NC}  $1"; }
warn() { echo -e "${YELLOW}⚠${NC}   $1"; }

# ─── Vérifications ────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || { echo " Node.js est requis"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo " npm est requis";     exit 1; }

ROOT="chat-app"
log "Création du projet dans ./${ROOT}"
mkdir -p "$ROOT"
cd "$ROOT"

# =============================================================================
#  SERVEUR
# =============================================================================
log " Initialisation du serveur..."

mkdir -p server/{models,routes,middleware,websocket}
cd server

# --- package.json OK  ---
cat > package.json << 'EOF'
{
  "name": "chat-app-server",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  }
} 
EOF 

# --- .env.example OK  ---
cat > .env.example << 'EOF'
PORT=3001
MONGO_URI=mongodb://localhost:27017/chatapp
JWT_SECRET=change_this_secret_in_production
CLIENT_URL=http://localhost:5173
EOF
cp .env.example .env
ok ".env créé (pense à changer JWT_SECRET en prod)"

# --- index.js OK  ---
cat > index.js << 'EOF'
require('dotenv').config();
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const { initWsServer } = require('./websocket/WsServer');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

initWsServer(server);

const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chatapp';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('[DB] MongoDB connecté');
    server.listen(PORT, () => {
      console.log(`[API] Serveur démarré sur http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[DB] Erreur de connexion MongoDB:', err.message);
    process.exit(1);
  });
EOF

# --- middleware/auth.js OK ---
cat > middleware/auth.js << 'EOF'
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token manquant' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token invalide' });
  }
};

const verifyWsToken = async (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.userId);
  if (!user) throw new Error('Utilisateur introuvable');
  return user;
};

module.exports = { authMiddleware, verifyWsToken };
EOF

# --- models/User.js OK---
cat > models/User.js << 'EOF'
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 30 },
  password: { type: String, required: true, minlength: 6 },
  avatar: {
    type: String,
    default: function () {
      const colors = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#14b8a6','#f59e0b'];
      return colors[Math.floor(Math.random() * colors.length)];
    },
  },
  createdAt: { type: Date, default: Date.now },
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
EOF

# --- models/Room.js OK ---
cat > models/Room.js << 'EOF'
const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true, trim: true, maxlength: 50 },
  description: { type: String, default: '', maxlength: 200 },
  type:        { type: String, enum: ['public','private'], default: 'public' },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt:   { type: Date, default: Date.now },
});

module.exports = mongoose.model('Room', roomSchema);
EOF

# --- models/Message.js OK ---
cat > models/Message.js << 'EOF'
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  room:      { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:   { type: String, required: true, trim: true, maxlength: 2000 },
  type:      { type: String, enum: ['text','system'], default: 'text' },
  createdAt: { type: Date, default: Date.now, index: true },
});

messageSchema.index({ room: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
EOF

# --- routes/auth.js OK ---
cat > routes/auth.js << 'EOF'
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
EOF

# --- routes/rooms.js OK ---
cat > routes/rooms.js << 'EOF'
const express = require('express');
const Room = require('../models/Room');
const Message = require('../models/Message');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const rooms = await Room.find({ type: 'public' })
      .populate('createdBy', 'username avatar')
      .sort({ createdAt: -1 });
    res.json(rooms);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, type } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    const room = await Room.create({
      name, description, type: type || 'public',
      createdBy: req.user._id, members: [req.user._id],
    });
    await room.populate('createdBy', 'username avatar');
    res.status(201).json(room);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Nom de salon déjà utilisé' });
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const messages = await Message.find({ room: req.params.id })
      .populate('author', 'username avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json(messages.reverse());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
EOF

# --- websocket/WsServer.js OK ---
cat > websocket/WsServer.js << 'EOF'
const { WebSocketServer } = require('ws');
const { parse } = require('url');
const { verifyWsToken } = require('../middleware/auth');
const Message = require('../models/Message');

const rooms   = new Map(); // roomId → Set<ws>
const clients = new Map(); // ws → { user, roomId }

const send = (ws, event, data) => {
  if (ws.readyState === 1) ws.send(JSON.stringify({ event, data }));
};

const broadcast = (roomId, event, data, excludeWs = null) => {
  const members = rooms.get(roomId);
  if (!members) return;
  for (const ws of members) if (ws !== excludeWs) send(ws, event, data);
};

const broadcastRoomUsers = (roomId) => {
  const members = rooms.get(roomId);
  if (!members) return;
  const users = [...members]
    .map((ws) => { const { user } = clients.get(ws) || {}; return user ? { _id: user._id, username: user.username, avatar: user.avatar } : null; })
    .filter(Boolean);
  broadcast(roomId, 'room_users', { roomId, users });
};

const handleJoinRoom = async (ws, { roomId }) => {
  const state = clients.get(ws);
  if (!state) return;
  if (state.roomId) {
    rooms.get(state.roomId)?.delete(ws);
    broadcast(state.roomId, 'user_left', { userId: state.user._id, username: state.user.username, roomId: state.roomId });
    broadcastRoomUsers(state.roomId);
  }
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);
  state.roomId = roomId;
  broadcast(roomId, 'user_joined', { userId: state.user._id, username: state.user.username, roomId }, ws);
  broadcastRoomUsers(roomId);
  send(ws, 'joined_room', { roomId });
};

const handleSendMessage = async (ws, { roomId, content }) => {
  const state = clients.get(ws);
  if (!state || !content?.trim()) return;
  try {
    const message = await Message.create({ room: roomId, author: state.user._id, content: content.trim() });
    await message.populate('author', 'username avatar');
    broadcast(roomId, 'new_message', {
      _id: message._id, room: roomId,
      author: { _id: state.user._id, username: state.user.username, avatar: state.user.avatar },
      content: message.content, createdAt: message.createdAt,
    });
  } catch (err) {
    send(ws, 'error', { message: "Erreur lors de l'envoi du message" });
  }
};

const handleTyping = (ws, { roomId, isTyping }) => {
  const state = clients.get(ws);
  if (!state) return;
  broadcast(roomId, 'typing', { userId: state.user._id, username: state.user.username, isTyping, roomId }, ws);
};

const initWsServer = (server) => {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', async (ws, req) => {
    const { query } = parse(req.url, true);
    let user;
    try { user = await verifyWsToken(query.token); }
    catch { ws.close(4001, 'Unauthorized'); return; }

    clients.set(ws, { user, roomId: null });
    send(ws, 'authenticated', { user: { _id: user._id, username: user.username, avatar: user.avatar } });
    console.log(`[WS] ${user.username} connecté`);

    ws.on('message', async (raw) => {
      let payload;
      try { payload = JSON.parse(raw); } catch { return; }
      const { event, data } = payload;
      if (event === 'join_room')    await handleJoinRoom(ws, data);
      else if (event === 'send_message') await handleSendMessage(ws, data);
      else if (event === 'typing')  handleTyping(ws, data);
      else send(ws, 'error', { message: `Événement inconnu: ${event}` });
    });

    ws.on('close', () => {
      const state = clients.get(ws);
      if (state?.roomId) {
        rooms.get(state.roomId)?.delete(ws);
        broadcast(state.roomId, 'user_left', { userId: state.user._id, username: state.user.username, roomId: state.roomId });
        broadcastRoomUsers(state.roomId);
      }
      clients.delete(ws);
      console.log(`[WS] ${user.username} déconnecté`);
    });

    ws.on('error', (err) => console.error('[WS] Erreur:', err.message));
  });
  console.log('[WS] Serveur WebSocket initialisé sur /ws');
};

module.exports = { initWsServer };
EOF

ok "Fichiers serveur créés"

log " Installation des dépendances serveur..."
npm install express mongoose ws jsonwebtoken bcryptjs cors dotenv uuid --silent
ok "Dépendances serveur installées"

cd ..

# =============================================================================
#  CLIENT
# =============================================================================
log "  Initialisation du client React (Vite)..."

npm create vite@latest client -- --template react --yes > /dev/null 2>&1 || \
  npm create vite@latest client -- --template react < /dev/null > /dev/null 2>&1 || true

cd client
npm install --silent
ok "Client React initialisé"

mkdir -p src/{context,hooks,pages}

# --- .env ---
cat > .env << 'EOF'
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=ws://localhost:3001/ws
EOF

# --- src/main.jsx ---
cat > src/main.jsx << 'EOF'
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
EOF

# --- src/App.jsx ---
cat > src/App.jsx << 'EOF'
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';

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
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  );
}
EOF

# --- src/index.css ---
cat > src/index.css << 'EOF'
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; background: #0f0f1a; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #2d2d4e; border-radius: 3px; }
EOF

# --- src/hooks/useWebSocket.js oK---
cat > src/hooks/useWebSocket.js << 'EOF'
import { useEffect, useRef, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

export const useWebSocket = ({ token, onMessage, onOpen, onClose }) => {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const attemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (!token) return;
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen  = () => { attemptsRef.current = 0; onOpen?.(); };
    ws.onmessage = (e) => {
      try { onMessage?.(JSON.parse(e.data)); } catch { console.error('[WS] Message non parsable'); }
    };
    ws.onclose = () => {
      onClose?.();
      const delay = Math.min(1000 * 2 ** attemptsRef.current, 30000);
      attemptsRef.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };
    ws.onerror = (e) => console.error('[WS] Erreur:', e);
  }, [token, onMessage, onOpen, onClose]);

  useEffect(() => {
    connect();
    return () => { clearTimeout(reconnectTimer.current); wsRef.current?.close(); };
  }, [connect]);

  const emit = useCallback((event, data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ event, data }));
  }, []);

  return { emit };
};
EOF

# --- src/context/AuthContext.jsx ---
cat > src/context/AuthContext.jsx << 'EOF'
import { createContext, useContext, useState, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,  setUser]  = useState(() => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } });
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  const login = useCallback(async (username, password) => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.token); setUser(data.user);
  }, []);

  const register = useCallback(async (username, password) => {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.token); setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    setToken(null); setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
EOF

# --- src/context/ChatContext.jsx ---
cat > src/context/ChatContext.jsx << 'EOF'
import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAuth } from './AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const ChatContext = createContext(null);

export const ChatProvider = ({ children }) => {
  const { token } = useAuth();
  const [rooms,       setRooms]       = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [connected,   setConnected]   = useState(false);
  const emitRef = useRef(null);

  const onMessage = useCallback(({ event, data }) => {
    if (event === 'new_message') setMessages((prev) => [...prev, data]);
    else if (event === 'room_users') setOnlineUsers(data.users);
    else if (event === 'user_left')  setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
    else if (event === 'typing') {
      if (data.isTyping) setTypingUsers((prev) => prev.find((u) => u.userId === data.userId) ? prev : [...prev, { userId: data.userId, username: data.username }]);
      else setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
    }
  }, []);

  const { emit } = useWebSocket({ token, onMessage, onOpen: () => setConnected(true), onClose: () => setConnected(false) });
  emitRef.current = emit;

  const fetchRooms = useCallback(async () => {
    const res = await fetch(`${API}/rooms`, { headers: { Authorization: `Bearer ${token}` } });
    setRooms(await res.json());
  }, [token]);

  const joinRoom = useCallback(async (room) => {
    setCurrentRoom(room); setMessages([]); setOnlineUsers([]); setTypingUsers([]);
    const res = await fetch(`${API}/rooms/${room._id}/messages`, { headers: { Authorization: `Bearer ${token}` } });
    setMessages(await res.json());
    emitRef.current('join_room', { roomId: room._id });
  }, [token]);

  const sendMessage = useCallback((content) => {
    if (!currentRoom || !content.trim()) return;
    emitRef.current('send_message', { roomId: currentRoom._id, content });
  }, [currentRoom]);

  const sendTyping = useCallback((isTyping) => {
    if (!currentRoom) return;
    emitRef.current('typing', { roomId: currentRoom._id, isTyping });
  }, [currentRoom]);

  const createRoom = useCallback(async (name, description = '') => {
    const res = await fetch(`${API}/rooms`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const room = await res.json();
    setRooms((prev) => [room, ...prev]);
    return room;
  }, [token]);

  return (
    <ChatContext.Provider value={{ rooms, currentRoom, messages, onlineUsers, typingUsers, connected, fetchRooms, joinRoom, sendMessage, sendTyping, createRoom }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);
EOF

# --- src/pages/AuthPage.jsx ---
cat > src/pages/AuthPage.jsx << 'EOF'
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
EOF

# --- src/pages/ChatPage.jsx ---
cat > src/pages/ChatPage.jsx << 'EOF'
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
EOF

ok "Fichiers client créés"
cd ../..

# =============================================================================
#  FIN
# =============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Projet créé avec succès !          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}Démarrer le serveur :${NC}"
echo -e "    cd ${ROOT}/server && npm run dev"
echo ""
echo -e "  ${BLUE}Démarrer le client :${NC}"
echo -e "    cd ${ROOT}/client && npm run dev"
echo ""
echo -e "  ${YELLOW}⚠  Prérequis :${NC} MongoDB doit tourner sur localhost:27017"
echo -e "     brew services start mongodb-community  ${YELLOW}# macOS${NC}"
echo -e "     sudo systemctl start mongod            ${YELLOW}# Linux${NC}"
echo ""

  Démarrer le serveur :
    cd chat-app/server && npm run dev

  Démarrer le client :
    cd chat-app/client && npm run dev

  ⚠  Prérequis : MongoDB doit tourner sur localhost:27017
     brew services start mongodb-community  # macOS
     sudo systemctl start mongod            # Linux
