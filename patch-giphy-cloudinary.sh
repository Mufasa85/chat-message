#!/usr/bin/env bash
# =============================================================================
#  patch-giphy-cloudinary.sh
#  Ajoute Giphy (stickers/GIFs) et Cloudinary (upload fichiers) au chat-app
#  Usage : bash patch-giphy-cloudinary.sh          (depuis la racine du projet)
#          bash patch-giphy-cloudinary.sh /chemin/vers/chat-app
# =============================================================================

set -e

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${BLUE}[patch]${NC} $1"; }
ok()   { echo -e "${GREEN}✔${NC}  $1"; }
warn() { echo -e "${YELLOW}⚠${NC}   $1"; }
err()  { echo -e "${RED}✘${NC}  $1"; exit 1; }

ROOT="${1:-$(pwd)}"
SERVER="$ROOT/server"
CLIENT="$ROOT/client/src"

[ -d "$SERVER" ] || err "Dossier server/ introuvable dans $ROOT"
[ -d "$CLIENT" ] || err "Dossier client/src/ introuvable dans $ROOT"

# =============================================================================
#  1. DÉPENDANCES SERVEUR
# =============================================================================
log " Installation des dépendances serveur (cloudinary, multer)..."
cd "$SERVER"
npm install cloudinary multer multer-storage-cloudinary --silent
ok "Dépendances installées"

# =============================================================================
#  2. VARIABLES D'ENVIRONNEMENT
# =============================================================================
log " Mise à jour de .env.example..."
cat >> "$SERVER/.env.example" << 'EOF'

# Cloudinary — https://cloudinary.com/console
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Giphy — https://developers.giphy.com/dashboard/
GIPHY_API_KEY=your_giphy_api_key
EOF

# Ajouter au .env existant si les clés ne sont pas déjà là
if [ -f "$SERVER/.env" ]; then
  grep -q "CLOUDINARY_CLOUD_NAME" "$SERVER/.env" || cat >> "$SERVER/.env" << 'EOF'

# Cloudinary — https://cloudinary.com/console
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Giphy — https://developers.giphy.com/dashboard/
GIPHY_API_KEY=your_giphy_api_key
EOF
fi
ok ".env mis à jour"

# =============================================================================
#  3. MODÈLE MESSAGE (mise à jour)
# =============================================================================
log " Mise à jour du modèle Message..."
cat > "$SERVER/models/Message.js" << 'EOF'
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  content: {
    type: String,
    default: '',
    trim: true,
    maxlength: 2000,
  },
  type: {
    type: String,
    enum: ['text', 'system', 'giphy', 'image', 'video', 'file', 'audio'],
    default: 'text',
  },
  attachment: {
    url:          { type: String },
    secureUrl:    { type: String },
    publicId:     { type: String },
    resourceType: { type: String },
    format:       { type: String },
    bytes:        { type: Number },
    width:        { type: Number },
    height:       { type: Number },
    filename:     { type: String },
    giphyId:      { type: String },
    giphyTitle:   { type: String },
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

messageSchema.index({ room: 1, createdAt: -1 });
module.exports = mongoose.model('Message', messageSchema);
EOF
ok "models/Message.js mis à jour"

# =============================================================================
#  4. MIDDLEWARE UPLOAD (Cloudinary)
# =============================================================================
log "  Création du middleware upload (Cloudinary)..."
mkdir -p "$SERVER/middleware"
cat > "$SERVER/middleware/upload.js" << 'EOF'
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const getResourceType = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/') || mimetype.startsWith('audio/')) return 'video';
  return 'raw';
};

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const resourceType = getResourceType(file.mimetype);
    return {
      folder: `chatapp/${resourceType}s`,
      resource_type: resourceType,
      allowed_formats: [
        'jpg','jpeg','png','gif','webp',
        'mp4','mov','avi','webm',
        'mp3','wav','ogg','m4a',
        'pdf','doc','docx','xls','xlsx','txt','zip',
      ],
      transformation: resourceType === 'image'
        ? [{ quality: 'auto', fetch_format: 'auto' }]
        : undefined,
    };
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const blocked = ['.exe','.sh','.bat','.cmd','.msi','.dmg'];
    const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (blocked.includes(ext)) return cb(new Error(`Type non autorisé : ${ext}`));
    cb(null, true);
  },
});

module.exports = { upload, cloudinary, getResourceType };
EOF
ok "middleware/upload.js créé"

# =============================================================================
#  5. ROUTE UPLOAD + GIPHY
# =============================================================================
log " Création de la route /api/upload..."
cat > "$SERVER/routes/upload.js" << 'EOF'
const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { upload, cloudinary, getResourceType } = require('../middleware/upload');
const Message = require('../models/Message');

const router = express.Router();

// POST /api/upload — envoyer un fichier sur Cloudinary et créer le message
router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: 'roomId requis' });

    const f = req.file;
    const mime = f.mimetype || '';
    let msgType = 'file';
    if (mime.startsWith('image/')) msgType = 'image';
    else if (mime.startsWith('video/')) msgType = 'video';
    else if (mime.startsWith('audio/')) msgType = 'audio';

    const message = await Message.create({
      room: roomId, author: req.user._id,
      content: req.body.caption || '',
      type: msgType,
      attachment: {
        url: f.path, secureUrl: f.path, publicId: f.filename,
        resourceType: getResourceType(mime),
        format: f.originalname.split('.').pop(),
        bytes: f.size, width: f.width, height: f.height,
        filename: f.originalname,
      },
    });
    await message.populate('author', 'username avatar');
    res.status(201).json(message);
  } catch (err) {
    console.error('[UPLOAD]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/upload/:publicId — supprimer un fichier Cloudinary
router.delete('/:publicId', authMiddleware, async (req, res) => {
  try {
    await cloudinary.uploader.destroy(decodeURIComponent(req.params.publicId));
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/upload/giphy?q=cat — recherche ou trending Giphy
router.get('/giphy', authMiddleware, async (req, res) => {
  try {
    const { q, limit = 20, offset = 0 } = req.query;
    const apiKey = process.env.GIPHY_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GIPHY_API_KEY manquante' });

    const endpoint = q
      ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}&lang=fr`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=${limit}&offset=${offset}`;

    const giphyRes = await fetch(endpoint);
    const data = await giphyRes.json();
    const gifs = data.data.map((g) => ({
      id: g.id, title: g.title,
      url:      g.images.fixed_height.url,
      original: g.images.original.url,
      preview:  g.images.fixed_height_small.url,
      width:    parseInt(g.images.fixed_height.width),
      height:   parseInt(g.images.fixed_height.height),
    }));
    res.json({ gifs, pagination: data.pagination });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
EOF
ok "routes/upload.js créé"

# =============================================================================
#  6. MISE À JOUR index.js (ajouter la route upload)
# =============================================================================
log " Ajout de la route /api/upload dans index.js..."
# Insertion après la ligne roomRoutes
if ! grep -q "uploadRoutes" "$SERVER/index.js"; then
  sed -i "s|const roomRoutes.*|&\nconst uploadRoutes = require('./routes/upload');|" "$SERVER/index.js"
  sed -i "s|app.use('/api/rooms'.*|&\napp.use('/api/upload', uploadRoutes);|" "$SERVER/index.js"
fi
ok "index.js mis à jour"

# =============================================================================
#  7. MISE À JOUR WsServer.js (support type + attachment)
# =============================================================================
log " Mise à jour du gestionnaire WebSocket (handleSendMessage)..."
# Remplacement ciblé de la fonction handleSendMessage
python3 - << 'PYEOF'
import re, pathlib

path = pathlib.Path("$SERVER/websocket/WsServer.js")
src  = path.read_text()

old = r"const handleSendMessage = async \(ws, \{ roomId, content \}\).*?^};"
new = """const handleSendMessage = async (ws, { roomId, content, type, attachment }) => {
  const state = clients.get(ws);
  if (!state) return;
  if (type === 'text' && !content?.trim()) return;
  try {
    const message = await Message.create({
      room: roomId, author: state.user._id,
      content: content?.trim() || '',
      type: type || 'text',
      attachment: attachment || undefined,
    });
    await message.populate('author', 'username avatar');
    broadcast(roomId, 'new_message', {
      _id: message._id, room: roomId,
      author: { _id: state.user._id, username: state.user.username, avatar: state.user.avatar },
      content: message.content, type: message.type,
      attachment: message.attachment, createdAt: message.createdAt,
    });
  } catch (err) {
    send(ws, 'error', { message: "Erreur lors de l'envoi du message" });
  }
};"""

result = re.sub(old, new, src, flags=re.DOTALL | re.MULTILINE)
path.write_text(result)
print("WsServer.js patché")
PYEOF
ok "websocket/WsServer.js mis à jour"

# =============================================================================
#  8. FICHIERS CLIENT
# =============================================================================
log " Création des composants React..."

mkdir -p "$CLIENT/components"

# ── GiphyPicker.jsx ──────────────────────────────────────────────────────────
cat > "$CLIENT/components/GiphyPicker.jsx" << 'EOF'
import { useState, useEffect, useRef, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function GiphyPicker({ token, onSelect, onClose }) {
  const [query,   setQuery]   = useState('');
  const [gifs,    setGifs]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [offset,  setOffset]  = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const debounce = useRef(null);
  const LIMIT = 24;

  const fetchGifs = useCallback(async (q, off = 0, append = false) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: LIMIT, offset: off });
      if (q) p.set('q', q);
      const res  = await fetch(`${API}/upload/giphy?${p}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setGifs((prev) => append ? [...prev, ...data.gifs] : data.gifs);
      setHasMore(data.gifs.length === LIMIT);
    } catch (e) { console.error('[Giphy]', e); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchGifs('', 0); }, [fetchGifs]);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setOffset(0); fetchGifs(query, 0); }, 400);
    return () => clearTimeout(debounce.current);
  }, [query, fetchGifs]);

  const s = {
    overlay:  { position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start', padding: '0 0 80px 260px' },
    picker:   { background: '#1a1a2e', borderRadius: 16, width: 380, maxHeight: 480, display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', border: '1px solid #2d2d4e', overflow: 'hidden' },
    header:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #2d2d4e' },
    search:   { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #2d2d4e', background: '#0f0f1a' },
    input:    { flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: '0.9rem' },
    grid:     { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, padding: 8, overflowY: 'auto', flex: 1 },
    item:     { borderRadius: 8, overflow: 'hidden', cursor: 'pointer', aspectRatio: '1', background: '#2d2d4e' },
    img:      { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
    skeleton: { borderRadius: 8, background: '#2d2d4e', aspectRatio: '1' },
    more:     { margin: '8px auto', display: 'block', background: '#2d2d4e', border: 'none', color: '#9ca3af', padding: '6px 20px', borderRadius: 20, cursor: 'pointer', fontSize: '0.85rem' },
    powered:  { display: 'flex', justifyContent: 'center', padding: 8, borderTop: '1px solid #2d2d4e' },
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.picker} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={{ color: '#fff', fontWeight: 700 }}> Stickers & GIFs</span>
          <button style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1rem' }} onClick={onClose}>✕</button>
        </div>
        <div style={s.search}>
          <span>🔍</span>
          <input style={s.input} placeholder="Rechercher un GIF..." value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          {query && <button style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }} onClick={() => setQuery('')}>✕</button>}
        </div>
        <div style={s.grid}>
          {gifs.map((gif) => (
            <div key={gif.id} style={s.item} onClick={() => { onSelect(gif); onClose(); }}>
              <img src={gif.preview} alt={gif.title} style={s.img} loading="lazy" />
            </div>
          ))}
          {loading && Array.from({ length: 8 }).map((_, i) => <div key={i} style={s.skeleton} />)}
        </div>
        {hasMore && !loading && gifs.length > 0 && (
          <button style={s.more} onClick={() => { const n = offset + LIMIT; setOffset(n); fetchGifs(query, n, true); }}>Charger plus</button>
        )}
        {!loading && gifs.length === 0 && <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>Aucun résultat</p>}
        <div style={s.powered}>
          <img src="https://media.giphy.com/headers/2022-07-12-18-56-25/Poweredby_100px-Black_VertText.png" alt="Powered by GIPHY" style={{ height: 24, opacity: 0.6 }} />
        </div>
      </div>
    </div>
  );
}
EOF

# ── MessageBubble.jsx ─────────────────────────────────────────────────────────
cat > "$CLIENT/components/MessageBubble.jsx" << 'EOF'
const formatBytes = (b) => {
  if (!b) return '';
  if (b < 1024) return `${b} o`;
  if (b < 1024**2) return `${(b/1024).toFixed(1)} Ko`;
  return `${(b/1024**2).toFixed(1)} Mo`;
};
const fileIcon = (f) => ({ pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',zip:'📦',txt:'🗒️',mp3:'🎵',wav:'🎵',mp4:'🎬',mov:'🎬' }[f?.toLowerCase()] || '📎');

export default function MessageBubble({ msg, isOwn }) {
  const att = msg.attachment;
  const s = {
    row:    { display:'flex', alignItems:'flex-end', gap:8 },
    av:     { width:34, height:34, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:'0.9rem', flexShrink:0 },
    bubble: { padding:'10px 14px', borderRadius:14, fontSize:'0.95rem', lineHeight:1.5, wordBreak:'break-word', maxWidth:'65%' },
    own:    { background:'#6366f1', color:'#fff', borderBottomRightRadius:4 },
    other:  { background:'#2d2d4e', color:'#e2e8f0', borderBottomLeftRadius:4 },
    media:  { padding:4, borderRadius:14 },
    time:   { color:'#6b7280', fontSize:'0.72rem', margin:'2px 4px 0' },
    img:    { width:'100%', borderRadius:10, display:'block', maxHeight:280, objectFit:'cover', cursor:'pointer' },
    video:  { width:'100%', borderRadius:10, maxHeight:280 },
    file:   { display:'flex', alignItems:'center', gap:12, padding:'8px 12px', background:'rgba(0,0,0,0.2)', borderRadius:10, textDecoration:'none', color:'inherit', minWidth:180 },
    fname:  { color:'#e2e8f0', fontSize:'0.88rem', fontWeight:600, margin:0, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
    cap:    { color:'rgba(255,255,255,0.75)', fontSize:'0.82rem', margin:'4px 4px 0', fontStyle:'italic' },
  };
  const isMedia = ['giphy','image','video'].includes(msg.type);
  const content = () => {
    if (msg.type === 'giphy' || msg.type === 'image') return (
      <div>
        <a href={att?.secureUrl||att?.url} target="_blank" rel="noreferrer">
          <img src={att?.secureUrl||att?.url} alt={att?.giphyTitle||att?.filename||'media'} style={s.img} loading="lazy" />
        </a>
        {msg.content && <p style={s.cap}>{msg.content}</p>}
      </div>
    );
    if (msg.type === 'video') return <video src={att?.secureUrl||att?.url} controls style={s.video} />;
    if (msg.type === 'audio') return (
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:'1.8rem' }}>🎵</span>
        <div><p style={s.fname}>{att?.filename}</p><audio src={att?.secureUrl||att?.url} controls style={{ width:180, marginTop:4 }} /></div>
      </div>
    );
    if (msg.type === 'file') return (
      <a href={att?.secureUrl||att?.url} target="_blank" rel="noreferrer" style={s.file}>
        <span style={{ fontSize:'1.8rem' }}>{fileIcon(att?.format)}</span>
        <div><p style={s.fname}>{att?.filename}</p><p style={{ color:'#9ca3af', fontSize:'0.75rem', margin:'2px 0 0' }}>{formatBytes(att?.bytes)}</p></div>
        <span style={{ marginLeft:'auto', color:'#9ca3af' }}>⬇</span>
      </a>
    );
    if (msg.type === 'system') return <em style={{ color:'#9ca3af', fontSize:'0.85rem' }}>{msg.content}</em>;
    return <span>{msg.content}</span>;
  };

  return (
    <div style={{ ...s.row, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
      {!isOwn && <div style={{ ...s.av, background: msg.author?.avatar||'#6366f1' }}>{msg.author?.username?.[0]?.toUpperCase()}</div>}
      <div>
        {!isOwn && <p style={{ color:'#9ca3af', fontSize:'0.78rem', margin:'0 0 3px 4px' }}>{msg.author?.username}</p>}
        <div style={{ ...s.bubble, ...(isOwn?s.own:s.other), ...(isMedia?s.media:{}) }}>{content()}</div>
        <p style={{ ...s.time, textAlign: isOwn?'right':'left' }}>
          {new Date(msg.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
        </p>
      </div>
      {isOwn && <div style={{ ...s.av, background:'#6366f1', marginLeft:8, marginRight:0 }}>{msg.author?.username?.[0]?.toUpperCase()}</div>}
    </div>
  );
}
EOF

# ── useFileUpload.js ──────────────────────────────────────────────────────────
cat > "$CLIENT/hooks/useFileUpload.js" << 'EOF'
import { useState, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const useFileUpload = ({ token, onUploaded }) => {
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [error,     setError]     = useState(null);
  const inputRef = useRef(null);

  const openPicker = () => inputRef.current?.click();

  const upload = async (file, roomId) => {
    if (!file || !roomId) return;
    setUploading(true); setError(null); setProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('roomId', roomId);
      const msg = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round(e.loaded/e.total*100)); };
        xhr.onload = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(JSON.parse(xhr.responseText).error));
        xhr.onerror = () => reject(new Error('Erreur réseau'));
        xhr.open('POST', `${API}/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(fd);
      });
      onUploaded?.(msg);
    } catch (e) { setError(e.message); }
    finally { setUploading(false); setProgress(0); if (inputRef.current) inputRef.current.value = ''; }
  };

  const FileInput = ({ roomId }) => (
    <input ref={inputRef} type="file" style={{ display:'none' }}
      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
      onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, roomId); }} />
  );

  return { uploading, progress, error, openPicker, upload, FileInput };
};

export const formatBytes = (b) => {
  if (!b) return '';
  if (b < 1024) return `${b} o`;
  if (b < 1024**2) return `${(b/1024).toFixed(1)} Ko`;
  return `${(b/1024**2).toFixed(1)} Mo`;
};
EOF
ok "Composants React créés"

# ── ChatContext.jsx (ajout sendGiphy) ─────────────────────────────────────────
log " Mise à jour de ChatContext (ajout sendGiphy)..."
python3 - << 'PYEOF'
import pathlib, re

path = pathlib.Path("$CLIENT/context/ChatContext.jsx")
src  = path.read_text()

old = "  const sendMessage = useCallback((content) => {\n    if (!currentRoom || !content.trim()) return;\n    emitRef.current('send_message', { roomId: currentRoom._id, content });\n  }, [currentRoom]);"

new = """  const sendMessage = useCallback((content) => {
    if (!currentRoom || !content.trim()) return;
    emitRef.current('send_message', { roomId: currentRoom._id, content, type: 'text' });
  }, [currentRoom]);

  const sendGiphy = useCallback((gif) => {
    if (!currentRoom) return;
    emitRef.current('send_message', {
      roomId: currentRoom._id,
      content: gif.title || '',
      type: 'giphy',
      attachment: { url: gif.original, giphyId: gif.id, giphyTitle: gif.title, width: gif.width, height: gif.height },
    });
  }, [currentRoom]);"""

if old in src:
    src = src.replace(old, new)
    src = src.replace(
        "fetchRooms, joinRoom, sendMessage, sendTyping, createRoom,",
        "fetchRooms, joinRoom, sendMessage, sendGiphy, sendTyping, createRoom,"
    )
    path.write_text(src)
    print("ChatContext.jsx patché")
else:
    print("sendGiphy déjà présent ou pattern non trouvé — vérifier manuellement")
PYEOF
ok "ChatContext.jsx mis à jour"

# =============================================================================
#  9. MISE À JOUR ChatPage.jsx
# =============================================================================
log " Mise à jour de ChatPage.jsx..."
cat > "$CLIENT/pages/ChatPage.jsx" << 'CHATEOF'
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useFileUpload } from '../hooks/useFileUpload';
import GiphyPicker from '../components/GiphyPicker';
import MessageBubble from '../components/MessageBubble';

function MessageInput({ currentRoom, token }) {
  const { sendMessage, sendTyping, sendGiphy } = useChat();
  const [text, setText] = useState('');
  const [showGiphy, setShowGiphy] = useState(false);
  const timer = useRef(null);
  const { uploading, progress, openPicker, FileInput } = useFileUpload({ token, onUploaded: () => {} });

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
    <div style={{ borderTop: '1px solid #2d2d4e', background: '#1a1a2e', position: 'relative' }}>
      {uploading && (
        <div style={{ height: 3, background: '#2d2d4e' }}>
          <div style={{ height: '100%', background: '#6366f1', width: `${progress}%`, transition: 'width 0.2s' }} />
        </div>
      )}
      <div style={{ padding: '1rem 1.5rem', display: 'flex', gap: 8, alignItems: 'center' }}>
        <FileInput roomId={currentRoom?._id} />
        <button style={s.iconBtn} onClick={openPicker} disabled={!currentRoom || uploading} title="Fichier">📎</button>
        <button style={s.iconBtn} onClick={() => setShowGiphy(v => !v)} disabled={!currentRoom} title="GIFs">🎬</button>
        <textarea style={s.textarea} placeholder={currentRoom ? `Message #${currentRoom.name}` : 'Rejoins un salon...'} value={text}
          onChange={handleChange} onKeyDown={(e) => { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();} }}
          disabled={!currentRoom||uploading} rows={1} />
        <button style={s.sendBtn} onClick={handleSend} disabled={!currentRoom||!text.trim()||uploading}>➤</button>
      </div>
      {showGiphy && <GiphyPicker token={token} onSelect={(gif) => { sendGiphy(gif); setShowGiphy(false); }} onClose={() => setShowGiphy(false)} />}
    </div>
  );
}

export default function ChatPage() {
  const { user, token, logout } = useAuth();
  const { rooms, currentRoom, messages, onlineUsers, typingUsers, connected, fetchRooms, joinRoom, createRoom } = useChat();
  const [showCreate, setShowCreate] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleCreate = async () => {
    if (!newRoomName.trim()) return;
    try { const r = await createRoom(newRoomName.trim()); setShowCreate(false); setNewRoomName(''); joinRoom(r); }
    catch (e) { alert(e.message); }
  };

  return (
    <div style={s.layout}>
      <div style={s.sidebar}>
        <div style={s.sidebarHeader}>
          <span style={{ color:'#fff', fontWeight:700, fontSize:'1.1rem' }}>💬 Salons</span>
          <button style={s.addBtn} onClick={() => setShowCreate(true)}>+</button>
        </div>
        <div style={{ overflowY:'auto', flex:1 }}>
          {rooms.map(r => (
            <div key={r._id} style={{ ...s.roomItem, ...(currentRoom?._id===r._id?{background:'#2d2d4e'}:{}) }} onClick={() => joinRoom(r)}>
              <span style={{ color:'#6366f1', fontWeight:700 }}>#</span>
              <span style={{ color:'#e2e8f0', fontSize:'0.95rem' }}>{r.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={s.main}>
        <div style={s.header}>
          <div>
            <span style={{ color:'#fff', fontWeight:700, fontSize:'1.1rem' }}>{currentRoom ? `# ${currentRoom.name}` : 'Sélectionne un salon'}</span>
            <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', marginLeft:8, background: connected?'#22c55e':'#ef4444' }} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ color:'#9ca3af', fontSize:'0.9rem' }}>@{user?.username}</span>
            <button style={s.logoutBtn} onClick={logout}>Déconnexion</button>
          </div>
        </div>

        <div style={s.messages}>
          {!currentRoom && <div style={s.empty}><p style={{ fontSize:'3rem' }}>💬</p><p style={{ color:'#9ca3af' }}>Rejoins un salon pour commencer</p></div>}
          {messages.map(m => <MessageBubble key={m._id} msg={m} isOwn={m.author?._id===user?._id||m.author===user?._id} />)}
          {typingUsers.length > 0 && <p style={{ color:'#9ca3af', fontSize:'0.85rem', padding:'0 1rem', fontStyle:'italic' }}>{typingUsers.map(u=>u.username).join(', ')} est en train d'écrire...</p>}
          <div ref={bottomRef} />
        </div>

        <MessageInput currentRoom={currentRoom} token={token} />
      </div>

      {currentRoom && (
        <div style={s.userList}>
          <p style={{ color:'#9ca3af', fontSize:'0.75rem', fontWeight:600, textTransform:'uppercase', margin:'0 0 12px' }}>En ligne — {onlineUsers.length}</p>
          {onlineUsers.map(u => (
            <div key={u._id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:u.avatar||'#6366f1', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'0.75rem', fontWeight:700 }}>{u.username?.[0]?.toUpperCase()}</div>
              <span style={{ color:'#e2e8f0', fontSize:'0.9rem' }}>{u.username}</span>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div style={s.modal}>
          <div style={s.modalCard}>
            <h3 style={{ color:'#fff', margin:'0 0 1rem' }}>Créer un salon</h3>
            <input style={s.modalInput} placeholder="Nom du salon" value={newRoomName} onChange={e=>setNewRoomName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleCreate()} autoFocus />
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <button style={s.sendBtn} onClick={handleCreate}>Créer</button>
              <button style={s.logoutBtn} onClick={() => setShowCreate(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  layout:       { display:'flex', height:'100vh', background:'#0f0f1a', fontFamily:'system-ui, sans-serif' },
  sidebar:      { width:240, background:'#1a1a2e', display:'flex', flexDirection:'column', borderRight:'1px solid #2d2d4e' },
  sidebarHeader:{ padding:'1rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #2d2d4e' },
  addBtn:       { background:'#6366f1', color:'#fff', border:'none', borderRadius:'6px', width:28, height:28, cursor:'pointer', fontSize:'1.1rem' },
  roomItem:     { padding:'10px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:8, borderRadius:8, margin:'2px 8px' },
  main:         { flex:1, display:'flex', flexDirection:'column', overflow:'hidden' },
  header:       { padding:'0 1.5rem', height:56, display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #2d2d4e', background:'#1a1a2e' },
  messages:     { flex:1, overflowY:'auto', padding:'1rem 1.5rem', display:'flex', flexDirection:'column', gap:8 },
  empty:        { flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center' },
  iconBtn:      { background:'none', border:'none', fontSize:'1.3rem', cursor:'pointer', padding:'6px', borderRadius:8, color:'#9ca3af', flexShrink:0 },
  textarea:     { flex:1, padding:'12px 16px', borderRadius:12, border:'1px solid #2d2d4e', background:'#0f0f1a', color:'#fff', fontSize:'0.95rem', resize:'none', outline:'none', fontFamily:'inherit' },
  sendBtn:      { padding:'10px 18px', borderRadius:12, border:'none', background:'#6366f1', color:'#fff', cursor:'pointer', fontWeight:700, fontSize:'1rem', flexShrink:0 },
  logoutBtn:    { padding:'6px 14px', borderRadius:8, border:'1px solid #2d2d4e', background:'transparent', color:'#9ca3af', cursor:'pointer', fontSize:'0.85rem' },
  userList:     { width:200, background:'#1a1a2e', padding:'1rem', borderLeft:'1px solid #2d2d4e', overflowY:'auto' },
  modal:        { position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 },
  modalCard:    { background:'#1a1a2e', padding:'2rem', borderRadius:16, width:320, boxShadow:'0 8px 32px rgba(0,0,0,0.4)' },
  modalInput:   { width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid #2d2d4e', background:'#0f0f1a', color:'#fff', fontSize:'0.95rem', outline:'none', boxSizing:'border-box' },
};
CHATEOF
ok "ChatPage.jsx mis à jour"

# =============================================================================
#  RÉSUMÉ FINAL
# =============================================================================
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Patch appliqué avec succès !             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${YELLOW}⚠  Remplis les clés dans server/.env :${NC}"
echo ""
echo -e "  ${BLUE}Cloudinary${NC} → https://cloudinary.com/console"
echo -e "    CLOUDINARY_CLOUD_NAME=..."
echo -e "    CLOUDINARY_API_KEY=..."
echo -e "    CLOUDINARY_API_SECRET=..."
echo ""
echo -e "  ${BLUE}Giphy${NC}      → https://developers.giphy.com/dashboard/"
echo -e "    GIPHY_API_KEY=..."
echo ""
echo -e "  Puis redémarre le serveur : ${GREEN}npm run dev${NC}"
echo ""
