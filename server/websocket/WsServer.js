const { WebSocketServer } = require('ws');
const { parse } = require('url');
const { verifyWsToken } = require('../middleware/auth');
const Message = require('../models/Message');
const User = require('../models/User');
const { handleAddReaction, handleRemoveReaction } = require('./reactionHandlers');

const rooms = new Map(); // roomId → Set<ws>
const clients = new Map(); // ws → { user, roomId }
const onlineUsers = new Map(); // userId → Set<ws>
const userSockets = new Map(); // userId → ws (pour signaling WebRTC 1-to-1)

const send = (ws, event, data) => {
  if (ws.readyState === 1) ws.send(JSON.stringify({ event, data }));
};

const broadcast = (roomId, event, data, excludeWs = null) => {
  const members = rooms.get(roomId);
  if (!members) return;
  for (const ws of members) if (ws !== excludeWs) send(ws, event, data);
};

const broadcastToUser = (userId, event, data) => {
  const sockets = onlineUsers.get(userId.toString());
  if (!sockets) return;
  for (const ws of sockets) send(ws, event, data);
};

const broadcastRoomUsers = (roomId) => {
  const members = rooms.get(roomId);
  if (!members) return;
  const users = [...members]
    .map((ws) => {
      const { user } = clients.get(ws) || {};
      return user ? { _id: user._id, username: user.username, avatar: user.avatar } : null;
    })
    .filter(Boolean);
  broadcast(roomId, 'room_users', { roomId, users });
};

const broadcastOnlineUsers = () => {
  const online = [...onlineUsers.keys()];
  for (const [ws, state] of clients) {
    send(ws, 'online_users', { users: online });
  }
};

const updateUserOnlineStatus = async (userId, isOnline) => {
  try {
    await User.findByIdAndUpdate(userId, {
      isOnline,
      lastSeen: isOnline ? Date.now() : new Date()
    });
  } catch (err) {
    console.error('[WS] Erreur update online status:', err.message);
  }
};

const handleJoinRoom = async (ws, { roomId }) => {
  const state = clients.get(ws);
  if (!state) return;
  
  // Quitter le salon précédent
  if (state.roomId) {
    rooms.get(state.roomId)?.delete(ws);
    broadcast(state.roomId, 'user_left', { 
      userId: state.user._id, 
      username: state.user.username, 
      roomId: state.roomId 
    });
    broadcastRoomUsers(state.roomId);
  }
  
  // Rejoindre le nouveau salon
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);
  state.roomId = roomId;
  
  broadcast(roomId, 'user_joined', { 
    userId: state.user._id, 
    username: state.user.username, 
    roomId 
  }, ws);
  broadcastRoomUsers(roomId);
  send(ws, 'joined_room', { roomId });
};

const handleSendMessage = async (ws, { roomId, content, type, attachment, ephemeral = false, ttl = 300 }) => {
  const state = clients.get(ws);
  if (!state) return;
  
  // Pour les messages texte, le contenu est requis
  if (type === 'text' || !type) {
    if (!content?.trim()) return;
  }
  
  // Limiter la longueur du message
  const trimmedContent = content?.trim()?.substring(0, 2000) || '';
  
  try {
    let message;
    const msgData = {
      room: roomId,
      author: state.user._id,
      content: trimmedContent,
      type: type || 'text',
      attachment: attachment || undefined
    };
    
    if (ephemeral) {
      // Créer un message éphémère avec le TTL spécifié
      message = await Message.createEphemeral({
        ...msgData,
        ephemeral: true
      }, ttl);
    } else {
      // Message normal
      message = await Message.create(msgData);
    }
    
    await message.populate('author', 'username avatar');
    
    broadcast(roomId, 'new_message', {
      _id: message._id,
      room: roomId,
      author: { _id: state.user._id, username: state.user.username, avatar: state.user.avatar },
      content: message.content,
      type: message.type,
      attachment: message.attachment,
      createdAt: message.createdAt,
      ephemeral: message.ephemeral,
      ttl: message.ttl,
      expiresAt: message.expiresAt,
    });
  } catch (err) {
    send(ws, 'error', { message: "Erreur lors de l'envoi du message" });
  }
};

// ─── Utilitaires WebRTC ──────────────────────────────────────────────────────

const sendToUser = (userId, event, data) => {
  const ws = userSockets.get(String(userId));
  if (ws) send(ws, event, data);
};

// ─── Handlers WebRTC (signaling) ─────────────────────────────────────────────

// Appel entrant : l'appelant envoie son SDP offer + type d'appel
const handleCallOffer = (ws, { targetUserId, sdp, callType }) => {
  const state = clients.get(ws);
  if (!state) return;
  const targetWs = userSockets.get(String(targetUserId));
  console.log(`[WS] call_offer de ${state.user.username} → target: ${targetUserId} | trouvé: ${!!targetWs} | userSockets keys: [${[...userSockets.keys()].join(', ')}]`);
  sendToUser(targetUserId, 'incoming_call', {
    callerId: String(state.user._id),
    callerName: state.user.username,
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
    calleeId: String(state.user._id),
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

// ─── Handlers Chat ────────────────────────────────────────────────────────────

const handleTyping = (ws, { roomId, isTyping }) => {
  const state = clients.get(ws);
  if (!state) return;
  broadcast(roomId, 'typing', { 
    userId: state.user._id, 
    username: state.user.username, 
    isTyping, 
    roomId 
  }, ws);
};

const initWsServer = (server) => {
  const wss = new WebSocketServer({ server, path: '/ws' });
  
  wss.on('connection', async (ws, req) => {
    const { query } = parse(req.url, true);
    let user;
    
    try { 
      user = await verifyWsToken(query.token); 
    }
    catch (err) { 
      console.error('[WS] Auth échouée:', err.message);
      ws.close(4001, 'Unauthorized'); 
      return; 
    }

    console.log(`[WS] Connexion acceptée pour ${user.username}, tentative d'enregistrement...`);

    // Ajouter aux clients et online users
    clients.set(ws, { user, roomId: null });
    
    if (!onlineUsers.has(user._id.toString())) {
      onlineUsers.set(user._id.toString(), new Set());
    }
    onlineUsers.get(user._id.toString()).add(ws);
    
    // Mettre à jour le statut online dans la BDD (protégé)
    try {
      await updateUserOnlineStatus(user._id, true);
    } catch (err) {
      console.error('[WS] Erreur update online status:', err.message);
    }
    
    // Enregistrer pour le signaling WebRTC
    userSockets.set(String(user._id), ws);
    
    // Envoyer les infos de connexion
    send(ws, 'authenticated', { 
      user: { _id: user._id, username: user.username, avatar: user.avatar } 
    });
    
    // Envoyer la liste des utilisateurs en ligne
    send(ws, 'online_users', { users: [...onlineUsers.keys()] });
    
    console.log(`[WS] ${user.username} connecté (${onlineUsers.get(user._id.toString()).size} connexions)`);

    // Handler unique (avec logs d'erreurs)
    ws.on('message', async (raw) => {
      try {
        let payload;
        try {
          payload = JSON.parse(raw);
        } catch {
          return;
        }

        const { event, data } = payload;
        switch (event) {
          // Chat
          case 'join_room':      await handleJoinRoom(ws, data);     break;
          case 'send_message':   await handleSendMessage(ws, data);  break;
          case 'typing':         handleTyping(ws, data);             break;

          // Réactions emoji
          case 'add_reaction':    await handleAddReaction(ws, data, clients, broadcast);    break;
          case 'remove_reaction': await handleRemoveReaction(ws, data, clients, broadcast); break;

          // WebRTC signaling
          case 'call_offer':     handleCallOffer(ws, data);          break;
          case 'call_answer':    handleCallAnswer(ws, data);         break;
          case 'ice_candidate':  handleIceCandidate(ws, data);       break;
          case 'call_end':       handleCallEnd(ws, data);            break;

          default:
            send(ws, 'error', { message: `Événement inconnu: ${event}` });
        }
      } catch (err) {
        console.error('[WS] Exception on message:', err?.stack || err?.message);
        try { send(ws, 'error', { message: 'Erreur interne serveur' }); } catch {}
      }
    });



    ws.on('close', async (code, reason) => {
      try {
        const state0 = clients.get(ws);
        console.log('[WS] close event', {
          code,
          reason: reason || 'aucune',
          user: state0?.user?.username,
          userId: state0?.user?._id,
          roomId: state0?.roomId,
        });
      } catch (e) {
        console.error('[WS] close log failed:', e?.message);
      }

      const state = clients.get(ws);
      
      if (state?.roomId) {
        rooms.get(state.roomId)?.delete(ws);
        broadcast(state.roomId, 'user_left', { 
          userId: state.user._id, 
          username: state.user.username, 
          roomId: state.roomId 
        });
        broadcastRoomUsers(state.roomId);
      }
      
      // Retirer des online users
      const userConnections = onlineUsers.get(state?.user?._id?.toString());
      if (userConnections) {
        userConnections.delete(ws);
        if (userConnections.size === 0) {
          onlineUsers.delete(state.user._id.toString());
          try {
            await updateUserOnlineStatus(state.user._id, false);
          } catch (err) {
            console.error('[WS] Erreur update offline status:', err.message);
          }
        }
      }
      
      clients.delete(ws);

      const userId = String(state?.user?._id);
      if (userSockets.get(userId) === ws) {
        const remaining = userConnections?.size ? [...userConnections][0] : null;
        if (remaining) userSockets.set(userId, remaining);
        else userSockets.delete(userId);
      }

      console.log(`[WS] ${state?.user?.username || 'Unknown'} déconnecté`);
    });

    ws.on('error', (err) => console.error('[WS] Erreur:', err.message));
  });
  
  console.log('[WS] Serveur WebSocket initialisé sur /ws');
};

module.exports = { initWsServer };
