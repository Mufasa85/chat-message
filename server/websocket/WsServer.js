const { WebSocketServer } = require('ws');
const { parse } = require('url');
const { verifyWsToken } = require('../middleware/auth');
const Message = require('../models/Message');
const User = require('../models/User');

const rooms = new Map(); // roomId → Set<ws>
const clients = new Map(); // ws → { user, roomId }
const onlineUsers = new Map(); // userId → Set<ws>

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

const handleSendMessage = async (ws, { roomId, content, ephemeral = false, ttl = 300 }) => {
  const state = clients.get(ws);
  if (!state || !content?.trim()) return;
  
  // Limiter la longueur du message
  const trimmedContent = content.trim().substring(0, 2000);
  
  try {
    let message;
    
    if (ephemeral) {
      // Créer un message éphémère avec le TTL spécifié
      message = await Message.createEphemeral({
        room: roomId,
        author: state.user._id,
        content: trimmedContent
      }, ttl);
    } else {
      // Message normal
      message = await Message.create({
        room: roomId,
        author: state.user._id,
        content: trimmedContent
      });
    }
    
    await message.populate('author', 'username avatar');
    
    broadcast(roomId, 'new_message', {
      _id: message._id,
      room: roomId,
      author: { _id: state.user._id, username: state.user.username, avatar: state.user.avatar },
      content: message.content,
      createdAt: message.createdAt,
      ephemeral: message.ephemeral,
      ttl: message.ttl,
      expiresAt: message.expiresAt,
    });
  } catch (err) {
    send(ws, 'error', { message: "Erreur lors de l'envoi du message" });
  }
};

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

    // Ajouter aux clients et online users
    clients.set(ws, { user, roomId: null });
    
    if (!onlineUsers.has(user._id.toString())) {
      onlineUsers.set(user._id.toString(), new Set());
    }
    onlineUsers.get(user._id.toString()).add(ws);
    
    // Mettre à jour le statut online dans la BDD
    await updateUserOnlineStatus(user._id, true);
    
    // Envoyer les infos de connexion
    send(ws, 'authenticated', { 
      user: { _id: user._id, username: user.username, avatar: user.avatar } 
    });
    
    // Envoyer la liste des utilisateurs en ligne
    send(ws, 'online_users', { users: [...onlineUsers.keys()] });
    
    console.log(`[WS] ${user.username} connecté (${onlineUsers.get(user._id.toString()).size} connexions)`);

    ws.on('message', async (raw) => {
      let payload;
      try { 
        payload = JSON.parse(raw); 
      } catch { 
        return; 
      }
      
      const { event, data } = payload;
      
      if (event === 'join_room') {
        await handleJoinRoom(ws, data);
      }
      else if (event === 'send_message') {
        await handleSendMessage(ws, data);
      }
      else if (event === 'typing') {
        handleTyping(ws, data);
      }
      else {
        send(ws, 'error', { message: `Événement inconnu: ${event}` });
      }
    });

    ws.on('close', async () => {
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
      const userSockets = onlineUsers.get(state?.user?._id?.toString());
      if (userSockets) {
        userSockets.delete(ws);
        if (userSockets.size === 0) {
          onlineUsers.delete(state.user._id.toString());
          await updateUserOnlineStatus(state.user._id, false);
        }
      }
      
      clients.delete(ws);
      console.log(`[WS] ${state?.user?.username || 'Unknown'} déconnecté`);
    });

    ws.on('error', (err) => console.error('[WS] Erreur:', err.message));
  });
  
  console.log('[WS] Serveur WebSocket initialisé sur /ws');
};

module.exports = { initWsServer };
