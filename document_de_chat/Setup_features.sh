#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# setup-features.sh
#
# Ajoute 3 fonctionnalités différenciantes au projet de chat :
#   1. 🎤 Messages vocaux (enregistrement audio depuis le navigateur)
#   2. 👍 Réactions emoji sur les messages (temps réel via WebSocket)
#   3. 💻 Partage d'écran pendant un appel vidéo
#
# Usage :
#   chmod +x setup-features.sh
#   ./setup-features.sh
#
# À lancer depuis la racine du repo (là où se trouvent client/ et server/)
# ═══════════════════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✔]${NC} $1"; }
step()  { echo -e "${BLUE}[→]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }

CLIENT_DIR="client"
SERVER_DIR="server"

if [ ! -d "$CLIENT_DIR" ] || [ ! -d "$SERVER_DIR" ]; then
  warn "Dossiers client/ ou server/ introuvables. Lancez ce script depuis la racine du repo."
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "   Setup fonctionnalités différenciantes — Chat App"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─────────────────────────────────────────────────────────────────
# 🎤 FONCTIONNALITÉ 1 : MESSAGES VOCAUX
# ─────────────────────────────────────────────────────────────────
step "Création du composant VoiceRecorder..."
mkdir -p "$CLIENT_DIR/src/components"

cat > "$CLIENT_DIR/src/components/VoiceRecorder.jsx" << 'EOF'
import { useState, useRef, useCallback } from 'react';

/**
 * VoiceRecorder — Enregistrement de messages vocaux
 *
 * Utilise l'API MediaRecorder du navigateur pour enregistrer le micro,
 * puis upload le fichier audio vers /api/upload (Cloudinary).
 *
 * Props :
 *   roomId    — identifiant du salon courant
 *   token     — JWT pour l'authentification
 *   onSent    — callback appelé quand le message est envoyé avec succès
 *   apiUrl    — URL de base de l'API
 */
export default function VoiceRecorder({ roomId, token, onSent, apiUrl }) {
  const [state, setState] = useState('idle'); // idle | recording | preview | uploading
  const [audioUrl, setAudioUrl] = useState(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  // ── Démarrer l'enregistrement ──────────────────────────────────
  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg',
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState('preview');
        // Arrêter toutes les pistes du micro
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start(200); // collecter les données toutes les 200ms
      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setState('recording');

      // Compteur de durée
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      setError('Microphone inaccessible — vérifiez les permissions.');
    }
  }, []);

  // ── Arrêter l'enregistrement ───────────────────────────────────
  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ── Annuler et recommencer ─────────────────────────────────────
  const cancel = useCallback(() => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    blobRef.current = null;
    setAudioUrl(null);
    setDuration(0);
    setError(null);
    setState('idle');
  }, [audioUrl]);

  // ── Envoyer le message vocal ───────────────────────────────────
  const send = useCallback(async () => {
    if (!blobRef.current || !roomId) return;
    setState('uploading');
    try {
      const ext = blobRef.current.type.includes('webm') ? 'webm' : 'ogg';
      const file = new File([blobRef.current], `voice_${Date.now()}.${ext}`, {
        type: blobRef.current.type,
      });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('roomId', roomId);
      formData.append('caption', '🎤 Message vocal');

      const res = await fetch(`${apiUrl}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error('Échec de l\'envoi');

      const message = await res.json();
      onSent?.(message);

      // Nettoyer
      URL.revokeObjectURL(audioUrl);
      blobRef.current = null;
      setAudioUrl(null);
      setDuration(0);
      setState('idle');
    } catch (err) {
      setError('Erreur lors de l\'envoi : ' + err.message);
      setState('preview');
    }
  }, [roomId, token, apiUrl, audioUrl, onSent]);

  // ── Formater la durée ──────────────────────────────────────────
  const formatDuration = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── Styles ─────────────────────────────────────────────────────
  const st = {
    container: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#2d2d4e', borderRadius: 12 },
    btn: (color) => ({ background: color, border: 'none', borderRadius: '50%', width: 42, height: 42, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }),
    timer: { color: '#ef4444', fontWeight: 700, fontSize: '0.9rem', minWidth: 40 },
    pulse: { width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' },
    error: { color: '#ef4444', fontSize: '0.82rem', marginTop: 4 },
    audio: { flex: 1, height: 32 },
  };

  // ── Rendu selon l'état ─────────────────────────────────────────
  if (state === 'idle') return (
    <button onClick={startRecording} style={st.btn('#6366f1')} title="Enregistrer un message vocal">
      🎤
    </button>
  );

  if (state === 'recording') return (
    <div style={st.container}>
      <div style={st.pulse} />
      <span style={st.timer}>{formatDuration(duration)}</span>
      <span style={{ color: '#9ca3af', fontSize: '0.85rem', flex: 1 }}>Enregistrement...</span>
      <button onClick={stopRecording} style={st.btn('#ef4444')} title="Arrêter">⏹</button>
      <button onClick={cancel} style={st.btn('#4b5563')} title="Annuler">✕</button>
    </div>
  );

  if (state === 'preview') return (
    <div style={{ ...st.container, flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '1.2rem' }}>🎤</span>
        <audio src={audioUrl} controls style={st.audio} />
        <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{formatDuration(duration)}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={send} style={{ flex: 1, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px', cursor: 'pointer', fontWeight: 600 }}>
          Envoyer 📤
        </button>
        <button onClick={cancel} style={{ flex: 1, background: '#4b5563', color: '#fff', border: 'none', borderRadius: 8, padding: '8px', cursor: 'pointer' }}>
          Annuler ✕
        </button>
      </div>
      {error && <p style={st.error}>{error}</p>}
    </div>
  );

  if (state === 'uploading') return (
    <div style={st.container}>
      <span style={{ color: '#9ca3af' }}>Envoi en cours...</span>
    </div>
  );

  return null;
}
EOF
info "VoiceRecorder.jsx créé"

# ─────────────────────────────────────────────────────────────────
# 👍 FONCTIONNALITÉ 2 : RÉACTIONS EMOJI
# ─────────────────────────────────────────────────────────────────
step "Création du composant MessageReactions..."

cat > "$CLIENT_DIR/src/components/MessageReactions.jsx" << 'EOF'
import { useState } from 'react';

/**
 * MessageReactions — Réactions emoji sur les messages
 *
 * Affiche les réactions existantes et permet d'en ajouter/retirer.
 * Les mises à jour sont envoyées via WebSocket (emit).
 *
 * Props :
 *   messageId   — identifiant du message
 *   reactions   — objet { emoji: [userId, ...], ... }
 *   currentUser — utilisateur connecté ({ _id, username })
 *   emit        — fonction WebSocket pour envoyer des événements
 *   isOwn       — si le message appartient à l'utilisateur courant
 */

const AVAILABLE_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function MessageReactions({ messageId, reactions = {}, currentUser, emit, isOwn }) {
  const [showPicker, setShowPicker] = useState(false);

  // Vérifier si l'utilisateur courant a déjà réagi avec un emoji
  const hasReacted = (emoji) => {
    return reactions[emoji]?.includes(currentUser?._id);
  };

  // Ajouter ou retirer une réaction
  const toggleReaction = (emoji) => {
    if (!currentUser || !emit) return;
    const event = hasReacted(emoji) ? 'remove_reaction' : 'add_reaction';
    emit(event, { messageId, emoji });
    setShowPicker(false);
  };

  // Compter les réactions existantes (emoji → nombre)
  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);

  const st = {
    container: { position: 'relative', marginTop: 4 },
    reactions: { display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
    badge: (reacted) => ({
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 12,
      background: reacted ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)',
      border: reacted ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
      cursor: 'pointer', fontSize: '0.85rem', color: '#e2e8f0',
      transition: 'all 0.15s',
    }),
    addBtn: {
      width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.75rem', color: '#9ca3af',
    },
    picker: {
      position: 'absolute', bottom: '100%',
      [isOwn ? 'right' : 'left']: 0,
      marginBottom: 6, background: '#313338',
      borderRadius: 12, padding: '8px 10px',
      display: 'flex', gap: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      border: '1px solid rgba(255,255,255,0.1)', zIndex: 50,
    },
    emojiBtn: (reacted) => ({
      fontSize: '1.3rem', cursor: 'pointer', background: 'none', border: 'none',
      padding: '4px 6px', borderRadius: 8,
      background: reacted ? 'rgba(99,102,241,0.3)' : 'transparent',
      transition: 'transform 0.1s',
    }),
  };

  return (
    <div style={st.container}>
      <div style={st.reactions}>
        {/* Réactions existantes */}
        {reactionEntries.map(([emoji, users]) => (
          <button
            key={emoji}
            onClick={() => toggleReaction(emoji)}
            style={st.badge(hasReacted(emoji))}
            title={`${users.length} réaction${users.length > 1 ? 's' : ''}`}
          >
            <span>{emoji}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{users.length}</span>
          </button>
        ))}

        {/* Bouton pour ajouter une réaction */}
        <button
          onClick={() => setShowPicker(!showPicker)}
          style={st.addBtn}
          title="Ajouter une réaction"
        >
          😊
        </button>

        {/* Picker d'emojis */}
        {showPicker && (
          <div style={st.picker}>
            {AVAILABLE_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => toggleReaction(emoji)}
                style={st.emojiBtn(hasReacted(emoji))}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
EOF
info "MessageReactions.jsx créé"

# ─────────────────────────────────────────────────────────────────
# MISE À JOUR DU MODÈLE MESSAGE (réactions)
# ─────────────────────────────────────────────────────────────────
step "Création du patch pour le modèle Message (réactions)..."

cat > "$SERVER_DIR/patches/add-reactions-to-message.js" << 'EOF'
/**
 * PATCH : Ajouter le champ reactions au modèle Message
 *
 * Ce fichier montre les modifications à apporter à server/models/Message.js
 * pour supporter les réactions emoji.
 *
 * Ajoutez ce champ dans le schéma Message, après le champ "attachment" :
 *
 *   reactions: {
 *     type: Map,
 *     of: [String],   // emoji → [userId1, userId2, ...]
 *     default: {},
 *   },
 *
 * Exemple de document MongoDB après ajout :
 * {
 *   _id: "...",
 *   content: "Bonjour !",
 *   reactions: {
 *     "👍": ["userId1", "userId2"],
 *     "❤️": ["userId3"],
 *   }
 * }
 */

// Ce fichier est documentatif — appliquez le changement manuellement dans Message.js
console.log('Appliquez le champ reactions dans server/models/Message.js');
EOF

mkdir -p "$SERVER_DIR/patches"
mv "$SERVER_DIR/patches/add-reactions-to-message.js" "$SERVER_DIR/patches/add-reactions-to-message.js" 2>/dev/null || true
info "Patch documentatif créé → server/patches/add-reactions-to-message.js"

# ─────────────────────────────────────────────────────────────────
# HANDLERS WEBSOCKET pour les réactions
# ─────────────────────────────────────────────────────────────────
step "Création des handlers WebSocket pour les réactions..."

cat > "$SERVER_DIR/websocket/reactionHandlers.js" << 'EOF'
/**
 * Handlers WebSocket pour les réactions emoji
 *
 * À importer et utiliser dans server/websocket/WsServer.js :
 *
 *   const { handleAddReaction, handleRemoveReaction } = require('./reactionHandlers');
 *
 * Puis dans le switch(event) du handler ws.on('message') :
 *   case 'add_reaction':    await handleAddReaction(ws, data, clients, broadcast); break;
 *   case 'remove_reaction': await handleRemoveReaction(ws, data, clients, broadcast); break;
 */
const Message = require('../models/Message');

/**
 * Ajouter une réaction à un message
 * data : { messageId, emoji }
 */
const handleAddReaction = async (ws, { messageId, emoji }, clients, broadcast) => {
  const state = clients.get(ws);
  if (!state || !messageId || !emoji) return;

  const userId = String(state.user._id);

  try {
    const message = await Message.findById(messageId);
    if (!message) return;

    // Initialiser le tableau pour cet emoji si nécessaire
    const reactions = message.reactions || new Map();
    const users = reactions.get(emoji) || [];

    // Ajouter l'utilisateur s'il n'a pas déjà réagi
    if (!users.includes(userId)) {
      users.push(userId);
      reactions.set(emoji, users);
      message.reactions = reactions;
      await message.save();
    }

    // Diffuser la mise à jour à tous les membres du salon
    if (state.roomId) {
      broadcast(state.roomId, 'reaction_updated', {
        messageId,
        reactions: Object.fromEntries(message.reactions),
      });
    }
  } catch (err) {
    console.error('[WS] handleAddReaction:', err.message);
  }
};

/**
 * Retirer une réaction d'un message
 * data : { messageId, emoji }
 */
const handleRemoveReaction = async (ws, { messageId, emoji }, clients, broadcast) => {
  const state = clients.get(ws);
  if (!state || !messageId || !emoji) return;

  const userId = String(state.user._id);

  try {
    const message = await Message.findById(messageId);
    if (!message) return;

    const reactions = message.reactions || new Map();
    const users = (reactions.get(emoji) || []).filter((id) => id !== userId);

    if (users.length === 0) {
      reactions.delete(emoji);
    } else {
      reactions.set(emoji, users);
    }

    message.reactions = reactions;
    await message.save();

    if (state.roomId) {
      broadcast(state.roomId, 'reaction_updated', {
        messageId,
        reactions: Object.fromEntries(message.reactions),
      });
    }
  } catch (err) {
    console.error('[WS] handleRemoveReaction:', err.message);
  }
};

module.exports = { handleAddReaction, handleRemoveReaction };
EOF
info "reactionHandlers.js créé → server/websocket/reactionHandlers.js"

# ─────────────────────────────────────────────────────────────────
# 💻 FONCTIONNALITÉ 3 : PARTAGE D'ÉCRAN
# ─────────────────────────────────────────────────────────────────
step "Création du hook useScreenShare..."

cat > "$CLIENT_DIR/src/hooks/useScreenShare.js" << 'EOF'
import { useState, useRef, useCallback } from 'react';

/**
 * useScreenShare — Partage d'écran pendant un appel vidéo
 *
 * Ce hook gère le remplacement temporaire du flux vidéo (caméra)
 * par un flux de capture d'écran (getDisplayMedia), puis le
 * rétablissement de la caméra quand le partage s'arrête.
 *
 * Usage dans CallModal ou dans useWebRTC :
 *   const { isSharing, startScreenShare, stopScreenShare } = useScreenShare({ peerConnection, localVideoRef });
 */
export const useScreenShare = ({ peerConnection, localVideoRef }) => {
  const [isSharing, setIsSharing] = useState(false);
  const screenStreamRef = useRef(null);
  const originalVideoTrackRef = useRef(null);

  const startScreenShare = useCallback(async () => {
    if (!peerConnection) return;
    try {
      // Capturer l'écran
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      });

      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];

      // Remplacer la piste vidéo (caméra → écran) dans le PeerConnection
      const sender = peerConnection
        .getSenders()
        .find((s) => s.track?.kind === 'video');

      if (sender) {
        originalVideoTrackRef.current = sender.track;
        await sender.replaceTrack(screenTrack);
      }

      // Afficher le partage d'écran dans la vidéo locale
      if (localVideoRef?.current) {
        localVideoRef.current.srcObject = screenStream;
      }

      // Quand l'utilisateur arrête depuis le navigateur (bouton "Arrêter le partage")
      screenTrack.onended = () => stopScreenShare();

      setIsSharing(true);
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('[ScreenShare] Erreur:', err.message);
      }
      // L'utilisateur a annulé — pas d'erreur à afficher
    }
  }, [peerConnection, localVideoRef]);

  const stopScreenShare = useCallback(async () => {
    if (!peerConnection || !screenStreamRef.current) return;
    try {
      // Arrêter les pistes de capture d'écran
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;

      // Rétablir la caméra dans le PeerConnection
      if (originalVideoTrackRef.current) {
        const sender = peerConnection
          .getSenders()
          .find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(originalVideoTrackRef.current);
        }

        // Rétablir la vidéo locale (caméra)
        if (localVideoRef?.current) {
          const cameraStream = new MediaStream([originalVideoTrackRef.current]);
          localVideoRef.current.srcObject = cameraStream;
        }

        originalVideoTrackRef.current = null;
      }

      setIsSharing(false);
    } catch (err) {
      console.error('[ScreenShare] Erreur arrêt:', err.message);
    }
  }, [peerConnection, localVideoRef]);

  return { isSharing, startScreenShare, stopScreenShare };
};
EOF
info "useScreenShare.js créé → client/src/hooks/useScreenShare.js"

# ─────────────────────────────────────────────────────────────────
# INSTRUCTIONS D'INTÉGRATION
# ─────────────────────────────────────────────────────────────────
step "Création du guide d'intégration..."

cat > INTEGRATION.md << 'EOF'
# Guide d'intégration des nouvelles fonctionnalités

## 🎤 Messages vocaux

### 1. Dans le composant de saisie (ex: ChatInput.jsx ou ChatPage.jsx)
Importez et ajoutez VoiceRecorder à côté du bouton d'envoi :

```jsx
import VoiceRecorder from '../components/VoiceRecorder';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';

// Dans le composant :
const { token } = useAuth();
const { currentRoom, addMessage } = useChat();
const API = import.meta.env.VITE_API_URL;

<VoiceRecorder
  roomId={currentRoom?._id}
  token={token}
  apiUrl={API}
  onSent={(message) => addMessage(message)}
/>
```

### 2. Dans MessageBubble.jsx
Le type 'audio' est déjà géré ✅ — aucune modification nécessaire.

---

## 👍 Réactions emoji

### 1. Dans server/models/Message.js
Ajoutez le champ reactions dans le schéma :

```js
reactions: {
  type: Map,
  of: [String],
  default: {},
},
```

### 2. Dans server/websocket/WsServer.js
En haut du fichier, ajoutez :
```js
const { handleAddReaction, handleRemoveReaction } = require('./reactionHandlers');
```

Dans le switch(event) du handler ws.on('message') :
```js
case 'add_reaction':    await handleAddReaction(ws, data, clients, broadcast); break;
case 'remove_reaction': await handleRemoveReaction(ws, data, clients, broadcast); break;
```

Dans le handler onMessage de ChatContext.jsx, ajoutez :
```js
case 'reaction_updated':
  setMessages((prev) =>
    prev.map((m) => m._id === data.messageId ? { ...m, reactions: data.reactions } : m)
  );
  break;
```

### 3. Dans MessageBubble.jsx
Ajoutez après le contenu du message :
```jsx
import MessageReactions from './MessageReactions';
import { useChat } from '../context/ChatContext'; // pour emit

// Dans le composant, récupérez emit :
const { emit } = useChat();

// Ajoutez après le contenu :
<MessageReactions
  messageId={msg._id}
  reactions={msg.reactions || {}}
  currentUser={currentUser}
  emit={emit}
  isOwn={isOwn}
/>
```

---

## 💻 Partage d'écran

### Dans CallModal.jsx (bloc appel vidéo actif)

```jsx
import { useScreenShare } from '../hooks/useScreenShare';

// Dans le composant CallModal, ajoutez :
const { isSharing, startScreenShare, stopScreenShare } = useScreenShare({
  peerConnection: webrtc?.peerConnectionRef?.current,
  localVideoRef,
});

// Dans les contrôles vidéo, ajoutez ce bouton :
<Btn
  icon={isSharing ? '🖥️' : '📺'}
  label={isSharing ? 'Arrêter' : 'Partager'}
  onClick={isSharing ? stopScreenShare : startScreenShare}
  active={isSharing}
  small
/>
```

---

## Commit suggéré
```bash
git add .
git commit -m "feat: ajout messages vocaux, réactions emoji et partage d'écran"
git push
```
EOF
info "Guide d'intégration créé → INTEGRATION.md"

# ─────────────────────────────────────────────────────────────────
# RÉSUMÉ
# ─────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo -e "${GREEN}Tous les fichiers ont été créés avec succès !${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Fichiers créés :"
echo "  client/src/components/VoiceRecorder.jsx      — 🎤 Enregistrement vocal"
echo "  client/src/components/MessageReactions.jsx   — 👍 Réactions emoji"
echo "  client/src/hooks/useScreenShare.js           — 💻 Partage d'écran"
echo "  server/websocket/reactionHandlers.js         — Backend réactions WebSocket"
echo "  server/patches/add-reactions-to-message.js  — Documentation patch Message"
echo "  INTEGRATION.md                               — Guide d'intégration complet"
echo ""
echo "Prochaines étapes :"
echo "  1. Lisez INTEGRATION.md pour les instructions d'intégration"
echo "  2. Ajoutez le champ 'reactions' dans server/models/Message.js"
echo "  3. Branchez les handlers dans server/websocket/WsServer.js"
echo "  4. Intégrez VoiceRecorder dans votre composant de saisie"
echo "  5. Intégrez MessageReactions dans MessageBubble.jsx"
echo "  6. Intégrez useScreenShare dans CallModal.jsx"
echo "  7. Commitez tout : git add . && git commit -m 'feat: nouvelles fonctionnalités'"
echo "═══════════════════════════════════════════════════════════════"