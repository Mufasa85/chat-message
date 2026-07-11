/**
 * reactionHandlers.js — Handlers WebSocket pour les réactions emoji
 *
 * Déjà intégré dans WsServer.js via :
 *   const { handleAddReaction, handleRemoveReaction } = require('./reactionHandlers');
 *
 * Événements gérés :
 *   add_reaction    : { messageId, emoji }
 *   remove_reaction : { messageId, emoji }
 *
 * Événement diffusé en retour :
 *   reaction_updated : { messageId, reactions }
 */
const Message = require('../models/Message');

/**
 * Ajouter une réaction à un message
 */
const handleAddReaction = async (ws, { messageId, emoji }, clients, broadcast) => {
  const state = clients.get(ws);
  if (!state || !messageId || !emoji) return;

  const userId = String(state.user._id);

  try {
    const message = await Message.findById(messageId);
    if (!message) return;

    if (!message.reactions) message.reactions = new Map();
    const users = message.reactions.get(emoji) || [];

    if (!users.includes(userId)) {
      users.push(userId);
      message.reactions.set(emoji, users);
      message.markModified('reactions');
      await message.save();
    }

    const roomId = state.roomId || String(message.room);
    broadcast(roomId, 'reaction_updated', {
      messageId,
      reactions: Object.fromEntries(message.reactions),
    });
  } catch (err) {
    console.error('[WS] handleAddReaction:', err.message);
  }
};

/**
 * Retirer une réaction d'un message
 */
const handleRemoveReaction = async (ws, { messageId, emoji }, clients, broadcast) => {
  const state = clients.get(ws);
  if (!state || !messageId || !emoji) return;

  const userId = String(state.user._id);

  try {
    const message = await Message.findById(messageId);
    if (!message) return;

    if (!message.reactions) message.reactions = new Map();
    const users = (message.reactions.get(emoji) || []).filter((id) => id !== userId);

    if (users.length === 0) {
      message.reactions.delete(emoji);
    } else {
      message.reactions.set(emoji, users);
    }

    message.markModified('reactions');
    await message.save();

    const roomId = state.roomId || String(message.room);
    broadcast(roomId, 'reaction_updated', {
      messageId,
      reactions: Object.fromEntries(message.reactions),
    });
  } catch (err) {
    console.error('[WS] handleRemoveReaction:', err.message);
  }
};

module.exports = { handleAddReaction, handleRemoveReaction };
