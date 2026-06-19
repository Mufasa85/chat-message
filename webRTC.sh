bash
#!/usr/bin/env bash
# =============================================================================
#  patch-webrtc.sh
#  Ajoute la communication WebRTC (appel audio / vidéo) au chat-app
#  Usage : bash patch-webrtc.sh               (depuis la racine du projet)
#          bash patch-webrtc.sh /chemin/vers/chat-app
# =============================================================================

set -e

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${BLUE}[webrtc]${NC} $1"; }
ok()   { echo -e "${GREEN}✔${NC}  $1"; }
warn() { echo -e "${YELLOW}⚠${NC}   $1"; }
err()  { echo -e "${RED}✘${NC}  $1"; exit 1; }

ROOT="${1:-$(pwd)}"
SERVER="$ROOT/server"
CLIENT="$ROOT/client/src"

[ -d "$SERVER" ]          || err "server/ introuvable dans $ROOT"
[ -d "$CLIENT/hooks" ]    || err "client/src/hooks/ introuvable — lance setup.sh d'abord"
[ -d "$CLIENT/pages" ]    || err "client/src/pages/ introuvable"

mkdir -p "$CLIENT/components"

# =============================================================================
#  1. SERVEUR — Ajout des events WebRTC dans WsServer.js
# =============================================================================
log "🔌 Mise à jour du serveur WebSocket (signaling WebRTC)..."

cat > "$SERVER/websocket/WsServer.js" << 'EOF'
const { WebSocketServer } = require('ws');
const { parse } = require('url');
const { verifyWsToken } = require('../middleware/auth');
const Message = require('../models/Message');

// Map<roomId, Set<ws>>  — membres par salon
const rooms = new Map();
// Map<ws, { user, roomId }> — état par connexion
const clients = new Map();
// Map<userId, ws> — accès direct par userId (pour le signaling 1-to-1)
const userSockets = new Map();

// ─── Utilitaires ─────────────────────────────────────────────────────────────

const send = (ws, event, data) => {
  if (ws.readyState === 1) ws.send(JSON.stringify({ event, data }));
};

const sendToUser = (userId, event, data) => {
  const ws = userSockets.get(String(userId));
  if (ws) send(ws, event, data);
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

// ─── Handlers chat ────────────────────────────────────────────────────────────

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

const handleSendMessage = async (ws, { roomId, content, type, attachment }) => {
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
};

const handleTyping = (ws, { roomId, isTyping }) => {
  const state = clients.get(ws);
  if (!state) return;
  broadcast(roomId, 'typing', { userId: state.user._id, username: state.user.username, isTyping, roomId }, ws);
};

// ─── Handlers WebRTC (signaling) ──────────────────────────────────────────────
//
//  Flux de signaling :
//
//  Appelant                    Serveur (ici)               Appelé
//    │── call_offer ──────────────►│──── incoming_call ──────►│
//    │                             │                          │
//    │◄────────────── call_answer ─│◄──── call_answer ────────│
//    │                             │                          │
//    │── ice_candidate ───────────►│──── ice_candidate ──────►│
//    │◄────────────── ice_candidate│◄─── ice_candidate ───────│
//    │                             │                          │
//    │── call_end ────────────────►│──── call_end ───────────►│

// Appel entrant : l'appelant envoie son SDP offer + type d'appel
const handleCallOffer = (ws, { targetUserId, sdp, callType }) => {
  const state = clients.get(ws);
  if (!state) return;
  sendToUser(targetUserId, 'incoming_call', {
    callerId:     String(state.user._id),
    callerName:   state.user.username,
    callerAvatar: state.user.avatar,
    sdp,
    callType, // 'audio' | 'video'
  });
};

// L'appelé répond avec son SDP answer
const handleCallAnswer = (ws, { targetUserId, sdp, accepted }) => {
  const state = clients.get(ws);
  if (!state) return;
  sendToUser(targetUserId, 'call_answer', {
    calleeId:   String(state.user._id),
    calleeName: state.user.username,
    sdp,
    accepted,
  });
};

// Échange de candidats ICE (traversée NAT)
const handleIceCandidate = (ws, { targetUserId, candidate }) => {
  const state = clients.get(ws);
  if (!state) return;
  sendToUser(targetUserId, 'ice_candidate', {
    fromUserId: String(state.user._id),
    candidate,
  });
};

// Fin / annulation d'appel
const handleCallEnd = (ws, { targetUserId, reason }) => {
  const state = clients.get(ws);
  if (!state) return;
  sendToUser(targetUserId, 'call_end', {
    fromUserId: String(state.user._id),
    reason: reason || 'hangup',
  });
};

// ─── Initialisation ───────────────────────────────────────────────────────────

const initWsServer = (server) => {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    const { query } = parse(req.url, true);
    let user;
    try { user = await verifyWsToken(query.token); }
    catch { ws.close(4001, 'Unauthorized'); return; }

    clients.set(ws, { user, roomId: null });
    userSockets.set(String(user._id), ws);
    send(ws, 'authenticated', { user: { _id: user._id, username: user.username, avatar: user.avatar } });
    console.log(`[WS] ${user.username} connecté`);

    ws.on('message', async (raw) => {
      let payload;
      try { payload = JSON.parse(raw); } catch { return; }
      const { event, data } = payload;
      switch (event) {
        // Chat
        case 'join_room':      await handleJoinRoom(ws, data);     break;
        case 'send_message':   await handleSendMessage(ws, data);  break;
        case 'typing':         handleTyping(ws, data);             break;
        // WebRTC signaling
        case 'call_offer':     handleCallOffer(ws, data);          break;
        case 'call_answer':    handleCallAnswer(ws, data);         break;
        case 'ice_candidate':  handleIceCandidate(ws, data);       break;
        case 'call_end':       handleCallEnd(ws, data);            break;
        default:
          send(ws, 'error', { message: `Événement inconnu: ${event}` });
      }
    });

    ws.on('close', () => {
      const state = clients.get(ws);
      if (state?.roomId) {
        rooms.get(state.roomId)?.delete(ws);
        broadcast(state.roomId, 'user_left', { userId: state.user._id, username: state.user.username, roomId: state.roomId });
        broadcastRoomUsers(state.roomId);
      }
      clients.delete(ws);
      userSockets.delete(String(user._id));
      console.log(`[WS] ${user.username} déconnecté`);
    });

    ws.on('error', (err) => console.error('[WS] Erreur:', err.message));
  });

  console.log('[WS] Serveur WebSocket initialisé sur /ws');
};

module.exports = { initWsServer };
EOF
ok "WsServer.js mis à jour (signaling WebRTC)"

# =============================================================================
#  2. CLIENT — Hook useWebRTC.js
# =============================================================================
log "Création du hook useWebRTC..."

cat > "$CLIENT/hooks/useWebRTC.js" << 'EOF'
import { useState, useRef, useCallback, useEffect } from 'react';

// Serveurs STUN publics (Google) + TURN de secours si configuré
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Ajouter un serveur TURN ici pour les réseaux restrictifs :
    // { urls: 'turn:your-turn-server.com:3478', username: 'user', credential: 'pass' },
  ],
};

export const useWebRTC = ({ currentUser, emit, onCallStateChange }) => {
  const [callState, setCallState]     = useState('idle'); // idle | calling | incoming | active
  const [callType,  setCallType]      = useState(null);   // 'audio' | 'video'
  const [remoteUser, setRemoteUser]   = useState(null);   // { userId, username, avatar }
  const [isMuted,   setIsMuted]       = useState(false);
  const [isCamOff,  setIsCamOff]      = useState(false);

  const pcRef         = useRef(null); // RTCPeerConnection
  const localStream   = useRef(null); // MediaStream local
  const remoteStream  = useRef(null); // MediaStream distant
  const localVideoRef = useRef(null); // <video> local
  const remoteVideoRef= useRef(null); // <video> distant
  const pendingSdp    = useRef(null); // SDP offer reçue avant d'accepter
  const pendingCandidates = useRef([]); // ICE candidates reçus avant remoteDesc

  // ─── Utilitaires ───────────────────────────────────────────────────────────

  const updateState = useCallback((s) => {
    setCallState(s);
    onCallStateChange?.(s);
  }, [onCallStateChange]);

  const getMedia = useCallback(async (type) => {
    const constraints = {
      audio: true,
      video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }, []);

  const createPeerConnection = useCallback((targetUserId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Envoyer les candidats ICE au pair distant dès qu'ils arrivent
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        emit('ice_candidate', { targetUserId, candidate });
      }
    };

    // Recevoir les tracks distantes
    pc.ontrack = ({ streams }) => {
      remoteStream.current = streams[0];
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        hangUp(false);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [emit]);

  const cleanUp = useCallback(() => {
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current  = null;
    remoteStream.current = null;
    pendingSdp.current   = null;
    pendingCandidates.current = [];
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setIsMuted(false);
    setIsCamOff(false);
  }, []);

  // ─── Initier un appel ──────────────────────────────────────────────────────

  const startCall = useCallback(async (targetUser, type = 'video') => {
    try {
      setCallType(type);
      setRemoteUser(targetUser);
      updateState('calling');

      const stream = await getMedia(type);
      localStream.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection(targetUser.userId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      emit('call_offer', {
        targetUserId: targetUser.userId,
        sdp:  pc.localDescription,
        callType: type,
      });
    } catch (err) {
      console.error('[WebRTC] startCall:', err);
      cleanUp();
      updateState('idle');
    }
  }, [emit, getMedia, createPeerConnection, cleanUp, updateState]);

  // ─── Accepter un appel entrant ─────────────────────────────────────────────

  const acceptCall = useCallback(async () => {
    if (!pendingSdp.current || !remoteUser) return;
    try {
      const stream = await getMedia(callType);
      localStream.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection(remoteUser.userId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(pendingSdp.current));

      // Appliquer les ICE candidates mis en attente
      for (const c of pendingCandidates.current) {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingCandidates.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      emit('call_answer', {
        targetUserId: remoteUser.userId,
        sdp:      pc.localDescription,
        accepted: true,
      });

      updateState('active');
    } catch (err) {
      console.error('[WebRTC] acceptCall:', err);
      rejectCall();
    }
  }, [callType, remoteUser, emit, getMedia, createPeerConnection, updateState]);

  // ─── Refuser un appel ─────────────────────────────────────────────────────

  const rejectCall = useCallback(() => {
    if (remoteUser) {
      emit('call_answer', { targetUserId: remoteUser.userId, accepted: false });
    }
    cleanUp();
    setRemoteUser(null);
    setCallType(null);
    updateState('idle');
  }, [remoteUser, emit, cleanUp, updateState]);

  // ─── Raccrocher ───────────────────────────────────────────────────────────

  const hangUp = useCallback((notifyPeer = true) => {
    if (notifyPeer && remoteUser) {
      emit('call_end', { targetUserId: remoteUser.userId, reason: 'hangup' });
    }
    cleanUp();
    setRemoteUser(null);
    setCallType(null);
    updateState('idle');
  }, [remoteUser, emit, cleanUp, updateState]);

  // ─── Micro / caméra ───────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const audioTrack = localStream.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, []);

  const toggleCamera = useCallback(() => {
    const videoTrack = localStream.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsCamOff(!videoTrack.enabled);
    }
  }, []);

  // ─── Réception des events WebRTC (appelé depuis ChatContext) ──────────────

  const handleIncomingCall = useCallback(({ callerId, callerName, callerAvatar, sdp, callType: type }) => {
    if (callState !== 'idle') {
      // Déjà en appel — refuser automatiquement
      emit('call_answer', { targetUserId: callerId, accepted: false });
      return;
    }
    pendingSdp.current = sdp;
    setCallType(type);
    setRemoteUser({ userId: callerId, username: callerName, avatar: callerAvatar });
    updateState('incoming');
  }, [callState, emit, updateState]);

  const handleCallAnswer = useCallback(async ({ accepted, sdp }) => {
    if (!accepted) {
      cleanUp();
      setRemoteUser(null);
      setCallType(null);
      updateState('idle');
      return;
    }
    try {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(sdp));
      for (const c of pendingCandidates.current) {
        await pcRef.current?.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingCandidates.current = [];
      updateState('active');
    } catch (err) {
      console.error('[WebRTC] handleCallAnswer:', err);
    }
  }, [cleanUp, updateState]);

  const handleIceCandidate = useCallback(async ({ candidate }) => {
    if (!pcRef.current || !pcRef.current.remoteDescription) {
      pendingCandidates.current.push(candidate);
      return;
    }
    try {
      await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[WebRTC] addIceCandidate:', err);
    }
  }, []);

  const handleCallEnd = useCallback(() => {
    cleanUp();
    setRemoteUser(null);
    setCallType(null);
    updateState('idle');
  }, [cleanUp, updateState]);

  return {
    callState, callType, remoteUser,
    isMuted, isCamOff,
    localVideoRef, remoteVideoRef,
    startCall, acceptCall, rejectCall, hangUp,
    toggleMute, toggleCamera,
    // handlers à brancher dans ChatContext
    handleIncomingCall, handleCallAnswer, handleIceCandidate, handleCallEnd,
  };
};
EOF
ok "hooks/useWebRTC.js créé"

# =============================================================================
#  3. CLIENT — Composant CallModal.jsx
# =============================================================================
log " Création du composant CallModal..."

cat > "$CLIENT/components/CallModal.jsx" << 'EOF'
import { useEffect, useRef } from 'react';

// ─── Sonnerie entrante ────────────────────────────────────────────────────────
function useRingtone(active) {
  const ctx = useRef(null);
  const interval = useRef(null);

  useEffect(() => {
    if (!active) {
      clearInterval(interval.current);
      return;
    }
    const ring = () => {
      try {
        const ac = new AudioContext();
        ctx.current = ac;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.frequency.value = 440;
        gain.gain.setValueAtTime(0.1, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.6);
        osc.start(); osc.stop(ac.currentTime + 0.6);
      } catch {}
    };
    ring();
    interval.current = setInterval(ring, 2000);
    return () => { clearInterval(interval.current); ctx.current?.close(); };
  }, [active]);
}

// ─── CallModal ────────────────────────────────────────────────────────────────
export default function CallModal({
  callState,  // 'calling' | 'incoming' | 'active'
  callType,   // 'audio' | 'video'
  remoteUser, // { username, avatar }
  currentUser,
  isMuted, isCamOff,
  localVideoRef, remoteVideoRef,
  onAccept, onReject, onHangUp,
  onToggleMute, onToggleCamera,
}) {
  useRingtone(callState === 'incoming');

  if (!callState || callState === 'idle') return null;

  const avatar = (name, color, size = 56) => (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color || '#6366f1',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.4, flexShrink: 0 }}>
      {name?.[0]?.toUpperCase()}
    </div>
  );

  // ── Appel en cours (audio only) ou en attente de réponse ──────────────────
  if (callState === 'calling' || (callState === 'active' && callType === 'audio')) {
    return (
      <div style={s.overlay}>
        <div style={s.card}>
          <p style={s.subtitle}>{callState === 'calling' ? 'Appel en cours...' : '🎙 Appel audio actif'}</p>
          {avatar(remoteUser?.username, remoteUser?.avatar, 80)}
          <p style={s.name}>{remoteUser?.username}</p>

          <div style={s.controls}>
            <Btn icon={isMuted ? '🔇' : '🎙'} label={isMuted ? 'Activer' : 'Couper'} onClick={onToggleMute} active={isMuted} />
            <Btn icon="📵" label="Raccrocher" onClick={onHangUp} danger />
          </div>
        </div>
      </div>
    );
  }

  // ── Appel entrant ──────────────────────────────────────────────────────────
  if (callState === 'incoming') {
    return (
      <div style={s.overlay}>
        <div style={s.card}>
          <p style={s.subtitle}>📞 Appel {callType === 'video' ? 'vidéo' : 'audio'} entrant</p>
          {avatar(remoteUser?.username, remoteUser?.avatar, 80)}
          <p style={s.name}>{remoteUser?.username}</p>

          <div style={s.controls}>
            <Btn icon="✅" label="Accepter" onClick={onAccept} green />
            <Btn icon="❌" label="Refuser"  onClick={onReject} danger />
          </div>
        </div>
      </div>
    );
  }

  // ── Appel vidéo actif ──────────────────────────────────────────────────────
  if (callState === 'active' && callType === 'video') {
    return (
      <div style={s.videoOverlay}>
        {/* Vidéo distante (grande) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={s.remoteVideo}
        />

        {/* Vidéo locale (petite, coin bas-droite) */}
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={s.localVideo}
        />

        {/* Nom du pair */}
        <div style={s.remoteName}>{remoteUser?.username}</div>

        {/* Contrôles */}
        <div style={s.videoControls}>
          <Btn icon={isMuted  ? '🔇' : '🎙'} label={isMuted  ? 'Micro off' : 'Micro'} onClick={onToggleMute}  active={isMuted}  small />
          <Btn icon={isCamOff ? '🚫' : '📷'} label={isCamOff ? 'Cam off'   : 'Caméra'} onClick={onToggleCamera} active={isCamOff} small />
          <Btn icon="📵" label="Raccrocher" onClick={onHangUp} danger small />
        </div>
      </div>
    );
  }

  return null;
}

// ─── Bouton d'action ──────────────────────────────────────────────────────────
function Btn({ icon, label, onClick, danger, green, active, small }) {
  const bg = danger ? '#ef4444' : green ? '#22c55e' : active ? '#374151' : '#2d2d4e';
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      background: bg, border: 'none', borderRadius: 14,
      padding: small ? '8px 14px' : '12px 20px',
      color: '#fff', cursor: 'pointer', transition: 'opacity .15s',
      fontSize: small ? '1.3rem' : '1.6rem', minWidth: small ? 72 : 90,
    }}>
      <span>{icon}</span>
      <span style={{ fontSize: '0.7rem', fontWeight: 500 }}>{label}</span>
    </button>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  overlay:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 },
  card:         { background: '#1a1a2e', borderRadius: 20, padding: '2.5rem 3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.6)', minWidth: 300 },
  subtitle:     { color: '#9ca3af', fontSize: '0.9rem', margin: 0 },
  name:         { color: '#fff', fontWeight: 700, fontSize: '1.3rem', margin: 0 },
  controls:     { display: 'flex', gap: 16, marginTop: 12 },
  videoOverlay: { position: 'fixed', inset: 0, background: '#000', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  remoteVideo:  { width: '100%', height: '100%', objectFit: 'cover' },
  localVideo:   { position: 'absolute', bottom: 100, right: 20, width: 180, height: 120, borderRadius: 12, objectFit: 'cover', border: '2px solid #6366f1' },
  remoteName:   { position: 'absolute', top: 20, left: 20, color: '#fff', fontWeight: 700, fontSize: '1rem', background: 'rgba(0,0,0,0.4)', padding: '4px 12px', borderRadius: 8 },
  videoControls:{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 12 },
};
EOF
ok "components/CallModal.jsx créé"

# =============================================================================
#  4. CLIENT — Composant CallButton.jsx
# =============================================================================
log " Création du composant CallButton..."

cat > "$CLIENT/components/CallButton.jsx" << 'EOF'
export default function CallButton({ user, onCall }) {
  if (!user) return null;
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button
        style={s.btn}
        onClick={() => onCall(user, 'audio')}
        title={`Appel audio avec ${user.username}`}
      >
        🎙
      </button>
      <button
        style={s.btn}
        onClick={() => onCall(user, 'video')}
        title={`Appel vidéo avec ${user.username}`}
      >
        📹
      </button>
    </div>
  );
}

const s = {
  btn: {
    background: 'none',
    border: 'none',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: 6,
    color: '#9ca3af',
    transition: 'background .15s',
    lineHeight: 1,
  },
};
EOF
ok "components/CallButton.jsx créé"

# =============================================================================
#  5. CLIENT — Mise à jour ChatContext (routing events WebRTC)
# =============================================================================
log " Mise à jour de ChatContext (events WebRTC)..."

cat > "$CLIENT/context/ChatContext.jsx" << 'EOF'
import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useWebRTC }    from '../hooks/useWebRTC';
import { useAuth }      from './AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const ChatContext = createContext(null);

export const ChatProvider = ({ children }) => {
  const { token, user: currentUser } = useAuth();

  // ── State chat ────────────────────────────────────────────────────────────
  const [rooms,       setRooms]       = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [connected,   setConnected]   = useState(false);
  const emitRef = useRef(null);

  // ── WebRTC ─────────────────────────────────────────────────────────────────
  const webrtc = useWebRTC({
    currentUser,
    emit: (...args) => emitRef.current?.(...args),
  });

  // ── Routing WebSocket ──────────────────────────────────────────────────────
  const onMessage = useCallback(({ event, data }) => {
    switch (event) {
      // Chat
      case 'new_message':
        setMessages((prev) => [...prev, data]);
        break;
      case 'room_users':
        setOnlineUsers(data.users);
        break;
      case 'user_left':
        setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
        break;
      case 'typing':
        if (data.isTyping) {
          setTypingUsers((prev) =>
            prev.find((u) => u.userId === data.userId) ? prev
              : [...prev, { userId: data.userId, username: data.username }]
          );
        } else {
          setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
        }
        break;

      // WebRTC signaling
      case 'incoming_call':   webrtc.handleIncomingCall(data);  break;
      case 'call_answer':     webrtc.handleCallAnswer(data);    break;
      case 'ice_candidate':   webrtc.handleIceCandidate(data);  break;
      case 'call_end':        webrtc.handleCallEnd(data);       break;
    }
  }, [webrtc]);

  const { emit } = useWebSocket({
    token,
    onMessage,
    onOpen:  () => setConnected(true),
    onClose: () => setConnected(false),
  });
  emitRef.current = emit;

  // ── Actions chat ──────────────────────────────────────────────────────────
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
    <ChatContext.Provider value={{
      rooms, currentRoom, messages, onlineUsers, typingUsers, connected,
      fetchRooms, joinRoom, sendMessage, sendGiphy, sendTyping, createRoom,
      webrtc,
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);
EOF
ok "ChatContext.jsx mis à jour"

# =============================================================================
#  6. CLIENT — Mise à jour ChatPage.jsx (intégration CallModal + CallButton)
# =============================================================================
log " Mise à jour de ChatPage.jsx..."

cat > "$CLIENT/pages/ChatPage.jsx" << 'CHATEOF'
import { useEffect, useState, useRef } from 'react';
import { useAuth }         from '../context/AuthContext';
import { useChat }         from '../context/ChatContext';
import { useFileUpload }   from '../hooks/useFileUpload';
import GiphyPicker         from '../components/GiphyPicker';
import MessageBubble       from '../components/MessageBubble';
import CallModal           from '../components/CallModal';
import CallButton          from '../components/CallButton';

// ─── Barre de progression upload ─────────────────────────────────────────────
function UploadProgress({ progress }) {
  return (
    <div style={{ height: 3, background: '#2d2d4e' }}>
      <div style={{ height: '100%', background: '#6366f1', width: `${progress}%`, transition: 'width 0.2s' }} />
    </div>
  );
}

// ─── Zone de saisie ───────────────────────────────────────────────────────────
function MessageInput({ currentRoom, token }) {
  const { sendMessage, sendTyping, sendGiphy } = useChat();
  const [text,      setText]      = useState('');
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
      {uploading && <UploadProgress progress={progress} />}
      <div style={{ padding: '1rem 1.5rem', display: 'flex', gap: 8, alignItems: 'center' }}>
        <FileInput roomId={currentRoom?._id} />
        <button style={s.iconBtn} onClick={openPicker} disabled={!currentRoom || uploading} title="Fichier">📎</button>
        <button style={s.iconBtn} onClick={() => setShowGiphy(v => !v)} disabled={!currentRoom} title="GIFs">🎬</button>
        <textarea
          style={s.textarea}
          placeholder={currentRoom ? `Message #${currentRoom.name}` : 'Rejoins un salon...'}
          value={text} onChange={handleChange}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          disabled={!currentRoom || uploading} rows={1}
        />
        <button style={s.sendBtn} onClick={handleSend} disabled={!currentRoom || !text.trim() || uploading}>➤</button>
      </div>
      {showGiphy && (
        <GiphyPicker token={token} onSelect={(gif) => { sendGiphy(gif); setShowGiphy(false); }} onClose={() => setShowGiphy(false)} />
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function ChatPage() {
  const { user, token, logout } = useAuth();
  const {
    rooms, currentRoom, messages, onlineUsers, typingUsers, connected,
    fetchRooms, joinRoom, createRoom, webrtc,
  } = useChat();

  const [showCreate,  setShowCreate]  = useState(false);
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

      {/* ── Sidebar ── */}
      <div style={s.sidebar}>
        <div style={s.sidebarHeader}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>💬 Salons</span>
          <button style={s.addBtn} onClick={() => setShowCreate(true)}>+</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {rooms.map(r => (
            <div key={r._id}
              style={{ ...s.roomItem, ...(currentRoom?._id === r._id ? { background: '#2d2d4e' } : {}) }}
              onClick={() => joinRoom(r)}
            >
              <span style={{ color: '#6366f1', fontWeight: 700 }}>#</span>
              <span style={{ color: '#e2e8f0', fontSize: '0.95rem' }}>{r.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Zone principale ── */}
      <div style={s.main}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>
              {currentRoom ? `# ${currentRoom.name}` : 'Sélectionne un salon'}
            </span>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginLeft: 8, background: connected ? '#22c55e' : '#ef4444' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>@{user?.username}</span>
            <button style={s.logoutBtn} onClick={logout}>Déconnexion</button>
          </div>
        </div>

        {/* Messages */}
        <div style={s.messages}>
          {!currentRoom && (
            <div style={s.empty}>
              <p style={{ fontSize: '3rem' }}>💬</p>
              <p style={{ color: '#9ca3af' }}>Rejoins un salon pour commencer</p>
            </div>
          )}
          {messages.map(m => (
            <MessageBubble key={m._id} msg={m} isOwn={m.author?._id === user?._id || m.author === user?._id} />
          ))}
          {typingUsers.length > 0 && (
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0 1rem', fontStyle: 'italic' }}>
              {typingUsers.map(u => u.username).join(', ')} est en train d'écrire...
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        <MessageInput currentRoom={currentRoom} token={token} />
      </div>

      {/* ── Liste des utilisateurs en ligne + boutons d'appel ── */}
      {currentRoom && (
        <div style={s.userList}>
          <p style={s.userListTitle}>En ligne — {onlineUsers.length}</p>
          {onlineUsers.map(u => {
            const isSelf = String(u._id) === String(user?._id);
            return (
              <div key={u._id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isSelf ? 0 : 4 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: u.avatar || '#6366f1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>
                    {u.username?.[0]?.toUpperCase()}
                  </div>
                  <span style={{ color: '#e2e8f0', fontSize: '0.9rem' }}>{u.username}</span>
                </div>
                {!isSelf && (
                  <div style={{ paddingLeft: 36 }}>
                    <CallButton
                      user={{ userId: u._id, username: u.username, avatar: u.avatar }}
                      onCall={webrtc.startCall}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal appel WebRTC ── */}
      <CallModal
        callState={webrtc.callState}
        callType={webrtc.callType}
        remoteUser={webrtc.remoteUser}
        currentUser={user}
        isMuted={webrtc.isMuted}
        isCamOff={webrtc.isCamOff}
        localVideoRef={webrtc.localVideoRef}
        remoteVideoRef={webrtc.remoteVideoRef}
        onAccept={webrtc.acceptCall}
        onReject={webrtc.rejectCall}
        onHangUp={webrtc.hangUp}
        onToggleMute={webrtc.toggleMute}
        onToggleCamera={webrtc.toggleCamera}
      />

      {/* ── Modal création de salon ── */}
      {showCreate && (
        <div style={s.modal}>
          <div style={s.modalCard}>
            <h3 style={{ color: '#fff', margin: '0 0 1rem' }}>Créer un salon</h3>
            <input style={s.modalInput} placeholder="Nom du salon" value={newRoomName}
              onChange={e => setNewRoomName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()} autoFocus />
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  layout:        { display: 'flex', height: '100vh', background: '#0f0f1a', fontFamily: 'system-ui, sans-serif' },
  sidebar:       { width: 240, background: '#1a1a2e', display: 'flex', flexDirection: 'column', borderRight: '1px solid #2d2d4e' },
  sidebarHeader: { padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2d2d4e' },
  addBtn:        { background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', width: 28, height: 28, cursor: 'pointer', fontSize: '1.1rem' },
  roomItem:      { padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, margin: '2px 8px' },
  main:          { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header:        { padding: '0 1.5rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #2d2d4e', background: '#1a1a2e' },
  messages:      { flex: 1, overflowY: 'auto', padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 8 },
  empty:         { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  iconBtn:       { background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', padding: '6px', borderRadius: 8, color: '#9ca3af', flexShrink: 0 },
  textarea:      { flex: 1, padding: '12px 16px', borderRadius: 12, border: '1px solid #2d2d4e', background: '#0f0f1a', color: '#fff', fontSize: '0.95rem', resize: 'none', outline: 'none', fontFamily: 'inherit' },
  sendBtn:       { padding: '10px 18px', borderRadius: 12, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', flexShrink: 0 },
  logoutBtn:     { padding: '6px 14px', borderRadius: 8, border: '1px solid #2d2d4e', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: '0.85rem' },
  userList:      { width: 210, background: '#1a1a2e', padding: '1rem', borderLeft: '1px solid #2d2d4e', overflowY: 'auto' },
  userListTitle: { color: '#9ca3af', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', margin: '0 0 12px' },
  modal:         { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard:     { background: '#1a1a2e', padding: '2rem', borderRadius: 16, width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
  modalInput:    { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #2d2d4e', background: '#0f0f1a', color: '#fff', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' },
};
CHATEOF
ok "ChatPage.jsx mis à jour"

# =============================================================================
#  RÉSUMÉ
# =============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       WebRTC ajouté avec succès !                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}Fichiers créés / modifiés :${NC}"
echo -e "  server/websocket/WsServer.js       ← signaling (offer/answer/ice)"
echo -e "  client/src/hooks/useWebRTC.js      ← RTCPeerConnection + MediaStream"
echo -e "  client/src/components/CallModal.jsx ← UI appel entrant/actif/vidéo"
echo -e "  client/src/components/CallButton.jsx ← boutons 🎙 📹 par utilisateur"
echo -e "  client/src/context/ChatContext.jsx  ← routing events WebRTC"
echo -e "  client/src/pages/ChatPage.jsx       ← intégration complète"
echo ""
echo -e "  ${YELLOW}⚠  Pour les réseaux restrictifs (NAT symétrique)${NC}"
echo -e "     ajoute un serveur TURN dans useWebRTC.js :"
echo -e "     ${BLUE}ICE_SERVERS.iceServers.push(${NC}"
echo -e "       { urls: 'turn:ton-serveur:3478', username: '...', credential: '...' }"
echo -e "     ${BLUE})${NC}"
echo ""
echo -e "  ${YELLOW}⚠  WebRTC nécessite HTTPS en production${NC}"
echo -e "     En local (localhost) ça marche sans SSL."
echo ""
echo -e "  Redémarre serveur + client : ${GREEN}npm run dev${NC}"
echo ""