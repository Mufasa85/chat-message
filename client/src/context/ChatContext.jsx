import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useAuth } from './AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const ChatContext = createContext(null);

export const ChatProvider = ({ children }) => {
  const { token, user: currentUser } = useAuth();
  const [rooms,       setRooms]       = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [connected,   setConnected]   = useState(false);
  const [unreadCounts, setUnreadCounts] = useState(() => {
    // Charger depuis localStorage au démarrage
    try {
      const saved = localStorage.getItem('unreadCounts');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const emitRef = useRef(null);

  // ── WebRTC ─────────────────────────────────────────────────────────────────
  const webrtc = useWebRTC({
    currentUser,
    emit: (...args) => emitRef.current?.(...args),
  });
  const webrtcRef = useRef(webrtc);
  webrtcRef.current = webrtc;

  // ── Routing WebSocket ──────────────────────────────────────────────────────
  const onMessage = useCallback(({ event, data }) => {
    switch (event) {
      // Chat
      case 'new_message': {
        setMessages((prev) => [...prev, data]);
        // Normaliser les IDs en strings pour éviter les problèmes de type
        const messageRoomId = String(data.room);
        const currentRoomId = currentRoom ? String(currentRoom._id) : null;
        
        // Only increment if NOT in the current room (and currentRoom exists)
        if (currentRoomId && messageRoomId !== currentRoomId) {
          setUnreadCounts((prev) => {
            const newCounts = { ...prev, [messageRoomId]: (prev[messageRoomId] || 0) + 1 };
            localStorage.setItem('unreadCounts', JSON.stringify(newCounts));
            console.log('[Chat] Badge incrementé pour room:', messageRoomId, 'total:', newCounts[messageRoomId]);
            return newCounts;
          });
        } else if (!currentRoomId) {
          // currentRoom is null, just increment the count
          setUnreadCounts((prev) => {
            const newCounts = { ...prev, [messageRoomId]: (prev[messageRoomId] || 0) + 1 };
            localStorage.setItem('unreadCounts', JSON.stringify(newCounts));
            return newCounts;
          });
        }
        // If message is in current room, no need to update unread counts
        break;
      }
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
      // Gérer les messages uploadés (API REST)
      case 'message_uploaded':
        setMessages((prev) => [...prev, data]);
        break;

      // WebRTC signaling
      case 'incoming_call':
        webrtcRef.current.handleIncomingCall(data);
        break;
      case 'call_answer':
        webrtcRef.current.handleCallAnswer(data);
        break;
      case 'ice_candidate':
        webrtcRef.current.handleIceCandidate(data);
        break;
      case 'call_end':
        webrtcRef.current.handleCallEnd(data);
        break;
    }
  }, [currentRoom, currentUser]);

  const onOpen = useCallback(() => {
    console.log('[WS] Connecté');
    setConnected(true);
  }, []);

  const onClose = useCallback(() => {
    console.log('[WS] Déconnecté');
    setConnected(false);
  }, []);

  const { emit } = useWebSocket({ token, onMessage, onOpen, onClose });
  emitRef.current = emit;

  const fetchRooms = useCallback(async () => {
    const res = await fetch(`${API}/rooms`, { headers: { Authorization: `Bearer ${token}` } });
    setRooms(await res.json());
  }, [token]);

  const joinRoom = useCallback(async (room) => {
    // Marquer comme lu avant de changer de salon - utiliser String pour cohérence
    const roomIdStr = String(room._id);
    setUnreadCounts((prev) => {
      const newCounts = { ...prev, [roomIdStr]: 0 };
      localStorage.setItem('unreadCounts', JSON.stringify(newCounts));
      return newCounts;
    });
    
    setCurrentRoom(room); setMessages([]); setOnlineUsers([]); setTypingUsers([]);
    const res = await fetch(`${API}/rooms/${room._id}/messages`, { headers: { Authorization: `Bearer ${token}` } });
    setMessages(await res.json());
    emitRef.current('join_room', { roomId: room._id });
  }, [token]);

  const sendMessage = useCallback((content, ephemeral = false, ttl = 300) => {
    if (!currentRoom || !content.trim()) return;
    emitRef.current('send_message', { 
      roomId: currentRoom._id, 
      content,
      type: 'text',
      ephemeral,
      ttl
    });
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

  // Ajouter un message directement (utilisé pour les uploads de fichiers)
  const addMessage = useCallback((message) => {
    setMessages((prev) => {
      // Éviter les doublons
      if (prev.some((m) => m._id === message._id)) return prev;
      return [...prev, message];
    });
  }, []);

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

  const updateRoom = useCallback(async (roomId, updates) => {
    const res = await fetch(`${API}/rooms/${roomId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const updatedRoom = await res.json();
    setRooms((prev) => prev.map((r) => r._id === roomId ? updatedRoom : r));
    if (currentRoom?._id === roomId) {
      setCurrentRoom(updatedRoom);
    }
    return updatedRoom;
  }, [token, currentRoom]);

  const deleteRoom = useCallback(async (roomId) => {
    const res = await fetch(`${API}/rooms/${roomId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error((await res.json()).error);
    setRooms((prev) => prev.filter((r) => r._id !== roomId));
    if (currentRoom?._id === roomId) {
      setCurrentRoom(null);
      setMessages([]);
    }
    // Supprimer aussi les notifications pour ce salon
    setUnreadCounts((prev) => {
      const newCounts = { ...prev };
      delete newCounts[roomId];
      localStorage.setItem('unreadCounts', JSON.stringify(newCounts));
      return newCounts;
    });
  }, [token, currentRoom]);

  const deleteMessage = useCallback(async (roomId, messageId) => {
    const res = await fetch(`${API}/rooms/${roomId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error((await res.json()).error);
    setMessages((prev) => prev.filter((m) => m._id !== messageId));
  }, [token]);

  const updateMessage = useCallback(async (roomId, messageId, content) => {
    const res = await fetch(`${API}/rooms/${roomId}/messages/${messageId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const updatedMessage = await res.json();
    setMessages((prev) => prev.map((m) => m._id === messageId ? updatedMessage : m));
    return updatedMessage;
  }, [token]);

  const markRoomAsRead = useCallback((roomId) => {
    setUnreadCounts((prev) => {
      const newCounts = { ...prev, [roomId]: 0 };
      localStorage.setItem('unreadCounts', JSON.stringify(newCounts));
      return newCounts;
    });
  }, []);

  const getTotalUnread = useCallback(() => {
    return Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
  }, [unreadCounts]);

  const value = useMemo(() => ({
    rooms, currentRoom, messages, onlineUsers, typingUsers, connected, unreadCounts,
    fetchRooms, joinRoom, sendMessage, sendGiphy, sendTyping, createRoom, addMessage,
    updateRoom, deleteRoom, deleteMessage, updateMessage,
    markRoomAsRead, getTotalUnread,
  }), [rooms, currentRoom, messages, onlineUsers, typingUsers, connected, unreadCounts, fetchRooms, joinRoom, sendMessage, sendGiphy, sendTyping, createRoom, addMessage, updateRoom, deleteRoom, deleteMessage, updateMessage, markRoomAsRead, getTotalUnread]);

  const contextValue = useMemo(() => ({ ...value, webrtc }), [value, webrtc]);

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);
