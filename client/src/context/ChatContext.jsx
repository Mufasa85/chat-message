import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
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

  // Memoize callbacks to prevent WebSocket reconnection on every render
  const onMessage = useCallback(({ event, data }) => {
    if (event === 'new_message') setMessages((prev) => [...prev, data]);
    else if (event === 'room_users') setOnlineUsers(data.users);
    else if (event === 'user_left')  setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
    else if (event === 'typing') {
      if (data.isTyping) setTypingUsers((prev) => prev.find((u) => u.userId === data.userId) ? prev : [...prev, { userId: data.userId, username: data.username }]);
      else setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
    }
    // Gérer les messages uploadés (API REST)
    else if (event === 'message_uploaded') setMessages((prev) => [...prev, data]);
  }, []);

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

  const value = useMemo(() => ({
    rooms, currentRoom, messages, onlineUsers, typingUsers, connected, 
    fetchRooms, joinRoom, sendMessage, sendGiphy, sendTyping, createRoom, addMessage
  }), [rooms, currentRoom, messages, onlineUsers, typingUsers, connected, fetchRooms, joinRoom, sendMessage, sendGiphy, sendTyping, createRoom, addMessage]);

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);


