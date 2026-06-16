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