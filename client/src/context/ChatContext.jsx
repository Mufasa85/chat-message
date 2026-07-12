import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useAuth } from './AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Le contexte global du chat — toutes les données et actions disponibles dans l'app
const ChatContext = createContext(null);

// ChatProvider : le "cerveau" de l'application
// Il centralise : WebSocket, WebRTC, tous les états, toutes les actions
export const ChatProvider = ({ children }) => {
  const { token, user: currentUser } = useAuth();

  // ── États globaux du chat ──────────────────────────────────────────────────
  const [rooms,       setRooms]       = useState([]);        // Liste de tous les salons
  const [currentRoom, setCurrentRoom] = useState(null);      // Salon actuellement affiché
  const [messages,    setMessages]    = useState([]);        // Messages du salon actif
  const [onlineUsers, setOnlineUsers] = useState([]);        // Utilisateurs présents dans le salon
  const [typingUsers, setTypingUsers] = useState([]);        // Qui est en train de taper
  const [connected,   setConnected]   = useState(false);     // État de la connexion WebSocket
  const [unreadCounts, setUnreadCounts] = useState(() => {
    // Charger les compteurs non-lus depuis localStorage au démarrage
    // Ils persistent même si l'utilisateur ferme et rouvre l'app
    try {
      const saved = localStorage.getItem('unreadCounts');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // emitRef : référence vers la fonction emit du WebSocket
  // On utilise une ref plutôt que la valeur directe car useWebRTC est initialisé
  // AVANT que useWebSocket retourne emit — la ref permet de toujours pointer
  // vers la version la plus à jour sans recréer les callbacks WebRTC
  const emitRef = useRef(null);

  const [toasts,   setToasts]   = useState([]);  // Notifications toast (messages dans d'autres salons)
  const [dmUnread, setDmUnread] = useState(0);   // Badge non-lu pour les DMs

  // roomsRef : permet d'accéder aux rooms dans les callbacks WebSocket
  // sans les mettre en dépendance (évite les re-créations de callbacks)
  const roomsRef = useRef([]);
  roomsRef.current = rooms;

  // Affiche une notification toast pendant 4 secondes
  // Garde au maximum 4 toasts affichés simultanément (slice(-3) = garde les 3 derniers + le nouveau)
  const addToast = useCallback((toast) => {
    const id = Date.now(); // ID unique basé sur le timestamp
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // Ferme manuellement un toast
  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Demande la permission pour les notifications navigateur au premier chargement
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ── WebRTC (appels vidéo/audio) ────────────────────────────────────────────
  // On passe emit via emitRef pour éviter la dépendance circulaire :
  // WebRTC a besoin d'emit, mais emit vient de useWebSocket qui n'est pas encore appelé
  const webrtc = useWebRTC({
    currentUser,
    emit: (...args) => emitRef.current?.(...args),
  });
  // webrtcRef permet d'accéder à webrtc dans onMessage sans le mettre en dépendance
  const webrtcRef = useRef(webrtc);
  webrtcRef.current = webrtc;

  // ── Routeur d'événements WebSocket ────────────────────────────────────────
  // C'est ici que tous les messages du serveur sont distribués
  // Chaque 'case' correspond à un type d'événement envoyé par WsServer.js
  const onMessage = useCallback(({ event, data }) => {
    switch (event) {

      // Nouveau message dans un salon
      case 'new_message': {
        setMessages((prev) => [...prev, data]); // Ajouter à la liste affichée

        // Comparer en strings car MongoDB renvoie des ObjectId
        const messageRoomId = String(data.room);
        const currentRoomId = currentRoom ? String(currentRoom._id) : null;

        // Si le message vient d'UN AUTRE salon → incrémenter le badge non-lu
        const isOtherRoom = (currentRoomId && messageRoomId !== currentRoomId) || !currentRoomId;
        if (isOtherRoom) {
          setUnreadCounts((prev) => {
            const newCounts = { ...prev, [messageRoomId]: (prev[messageRoomId] || 0) + 1 };
            localStorage.setItem('unreadCounts', JSON.stringify(newCounts)); // Persister
            return newCounts;
          });

          const roomName = roomsRef.current.find((r) => String(r._id) === messageRoomId)?.name || 'Salon';
          const author   = data.author?.username || 'Quelqu\'un';
          const preview  = data.type === 'audio' ? '🎤 Message vocal'
            : data.type === 'image' ? '🖼 Image'
            : (data.content || '').slice(0, 60); // Tronquer le texte pour le toast

          addToast({ roomId: messageRoomId, roomName, author, preview });

          // Notification système si l'app est en arrière-plan
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
            new Notification(`${author} — #${roomName}`, {
              body: preview,
              icon: '/favicon.ico',
              tag: messageRoomId, // tag = une seule notif par salon (remplace la précédente)
            });
          }
        }
        break;
      }

      // Liste des utilisateurs présents dans le salon (mise à jour en temps réel)
      case 'room_users':
        setOnlineUsers(data.users);
        break;

      // Quelqu'un a quitté → le retirer de la liste "en train de taper"
      case 'user_left':
        setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
        break;

      // Indicateur de frappe en temps réel
      case 'typing':
        if (data.isTyping) {
          // Ajouter à la liste si pas déjà présent (éviter les doublons)
          setTypingUsers((prev) =>
            prev.find((u) => u.userId === data.userId) ? prev
              : [...prev, { userId: data.userId, username: data.username }]
          );
        } else {
          // Retirer quand l'utilisateur arrête de taper
          setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
        }
        break;

      // Message ajouté via upload REST (image, audio...) — pas via WebSocket send_message
      case 'message_uploaded':
        setMessages((prev) => [...prev, data]);
        break;

      // Réaction emoji mise à jour — on remplace le message concerné dans la liste
      case 'reaction_updated':
        setMessages((prev) =>
          prev.map((m) => m._id === data.messageId ? { ...m, reactions: data.reactions } : m)
        );
        break;

      // Notification de message privé reçu
      case 'dm_notification': {
        setDmUnread((prev) => prev + 1); // Incrémenter le badge DM
        addToast({
          roomId: null,
          roomName: null,
          author: data.fromUser?.username || 'Quelqu\'un',
          preview: data.preview || 'Message privé',
          isDM: true,
          fromUser: data.fromUser,
        });
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
          new Notification(`💬 ${data.fromUser?.username}`, {
            body: data.preview || 'Nouveau message privé',
            icon: '/favicon.ico',
          });
        }
        break;
      }

      // ── Signaling WebRTC — délégué au hook useWebRTC ──────────────────────
      // Ces événements servent à établir la connexion d'appel vidéo/audio
      case 'incoming_call':
        webrtcRef.current.handleIncomingCall(data);  // Appel entrant
        break;
      case 'call_answer':
        webrtcRef.current.handleCallAnswer(data);    // L'autre a accepté/refusé
        break;
      case 'ice_candidate':
        webrtcRef.current.handleIceCandidate(data);  // Échange d'adresses réseau
        break;
      case 'call_end':
        webrtcRef.current.handleCallEnd(data);       // Appel terminé
        break;
    }
  }, [currentRoom, currentUser]);

  // Appelée quand la connexion WebSocket s'établit
  const onOpen = useCallback(() => {
    console.log('[WS] Connecté');
    setConnected(true);
  }, []);

  // Appelée quand la connexion WebSocket se ferme (réseau, déconnexion...)
  const onClose = useCallback(() => {
    console.log('[WS] Déconnecté');
    setConnected(false);
  }, []);

  // Initialise la connexion WebSocket — retourne la fonction emit
  const { emit } = useWebSocket({ token, onMessage, onOpen, onClose });
  // Mettre à jour la ref pour que WebRTC puisse toujours utiliser la dernière version
  emitRef.current = emit;

  // Charge tous les salons depuis l'API REST (appelé au démarrage)
  const fetchRooms = useCallback(async () => {
    const res = await fetch(`${API}/rooms`, { headers: { Authorization: `Bearer ${token}` } });
    setRooms(await res.json());
  }, [token]);

  // Rejoint un salon : réinitialise les messages, charge l'historique via REST,
  // puis s'abonne aux nouveaux messages via WebSocket
  const joinRoom = useCallback(async (room) => {
    const roomIdStr = String(room._id);

    // Remettre le badge non-lu à 0 pour ce salon avant de le rejoindre
    setUnreadCounts((prev) => {
      const newCounts = { ...prev, [roomIdStr]: 0 };
      localStorage.setItem('unreadCounts', JSON.stringify(newCounts));
      return newCounts;
    });

    // Réinitialiser les états du salon précédent
    setCurrentRoom(room);
    setMessages([]);
    setOnlineUsers([]);
    setTypingUsers([]);

    // Charger l'historique des messages via API REST (plus fiable que WebSocket pour le bulk)
    const res = await fetch(`${API}/rooms/${room._id}/messages`, { headers: { Authorization: `Bearer ${token}` } });
    setMessages(await res.json());

    // Informer le serveur qu'on rejoint ce salon → recevoir les nouveaux messages en temps réel
    emitRef.current('join_room', { roomId: room._id });
  }, [token]);

  // Envoie un message texte via WebSocket
  // ephemeral : message qui disparaît après ttl secondes
  // replyTo   : _id du message auquel on répond
  const sendMessage = useCallback((content, ephemeral = false, ttl = 300, replyTo = null) => {
    if (!currentRoom || !content.trim()) return;
    emitRef.current('send_message', {
      roomId: currentRoom._id,
      content,
      type: 'text',
      ephemeral,
      ttl,
      replyTo,
    });
  }, [currentRoom]);

  // Envoie un GIF Giphy comme message (type 'giphy' avec les métadonnées du GIF)
  const sendGiphy = useCallback((gif) => {
    if (!currentRoom) return;
    emitRef.current('send_message', {
      roomId: currentRoom._id,
      content: gif.title || '',
      type: 'giphy',
      attachment: { url: gif.original, giphyId: gif.id, giphyTitle: gif.title, width: gif.width, height: gif.height },
    });
  }, [currentRoom]);

  // Informe le serveur qu'on est en train de taper (ou qu'on a arrêté)
  // Le serveur diffuse ça à tous les autres membres du salon
  const sendTyping = useCallback((isTyping) => {
    if (!currentRoom) return;
    emitRef.current('typing', { roomId: currentRoom._id, isTyping });
  }, [currentRoom]);

  // Ajoute un message directement dans la liste locale (utilisé après upload de fichier)
  // L'upload passe par REST, pas WebSocket — on ajoute manuellement pour éviter le doublon
  const addMessage = useCallback((message) => {
    setMessages((prev) => {
      if (prev.some((m) => m._id === message._id)) return prev; // Éviter les doublons
      return [...prev, message];
    });
  }, []);

  // Crée un nouveau salon via API REST et l'ajoute en tête de liste
  const createRoom = useCallback(async (name, description = '') => {
    const res = await fetch(`${API}/rooms`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const room = await res.json();
    setRooms((prev) => [room, ...prev]); // Ajouter en premier dans la liste
    return room;
  }, [token]);

  // Met à jour les infos d'un salon (nom, description) et synchronise le state local
  const updateRoom = useCallback(async (roomId, updates) => {
    const res = await fetch(`${API}/rooms/${roomId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const updatedRoom = await res.json();
    setRooms((prev) => prev.map((r) => r._id === roomId ? updatedRoom : r));
    // Si c'est le salon actif, mettre à jour currentRoom aussi
    if (currentRoom?._id === roomId) setCurrentRoom(updatedRoom);
    return updatedRoom;
  }, [token, currentRoom]);

  // Supprime un salon et nettoie le state (messages, compteur non-lu)
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
    // Nettoyer le badge non-lu pour ce salon
    setUnreadCounts((prev) => {
      const newCounts = { ...prev };
      delete newCounts[roomId];
      localStorage.setItem('unreadCounts', JSON.stringify(newCounts));
      return newCounts;
    });
  }, [token, currentRoom]);

  // Supprime un message et le retire immédiatement de l'affichage
  const deleteMessage = useCallback(async (roomId, messageId) => {
    const res = await fetch(`${API}/rooms/${roomId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error((await res.json()).error);
    setMessages((prev) => prev.filter((m) => m._id !== messageId));
  }, [token]);

  // Modifie le contenu d'un message et met à jour l'affichage immédiatement
  const updateMessage = useCallback(async (roomId, messageId, content) => {
    const res = await fetch(`${API}/rooms/${roomId}/messages/${messageId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const updatedMessage = await res.json();
    // Remplace le message dans la liste sans recharger tout
    setMessages((prev) => prev.map((m) => m._id === messageId ? updatedMessage : m));
    return updatedMessage;
  }, [token]);

  // Remet le compteur non-lu à 0 pour un salon (appelé quand on entre dans le salon)
  const markRoomAsRead = useCallback((roomId) => {
    setUnreadCounts((prev) => {
      const newCounts = { ...prev, [roomId]: 0 };
      localStorage.setItem('unreadCounts', JSON.stringify(newCounts));
      return newCounts;
    });
  }, []);

  // Calcule le total des messages non-lus sur tous les salons (pour le badge global)
  const getTotalUnread = useCallback(() => {
    return Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
  }, [unreadCounts]);

  // Fonction emit publique — permet aux composants d'envoyer des événements WebSocket
  // directement (ex: DM, réactions) sans passer par les fonctions spécialisées
  const emitEvent = useCallback((event, data) => {
    emitRef.current?.(event, data);
  }, []);

  // Remet le badge DM à 0 quand l'utilisateur ouvre la page DM
  const clearDmUnread = useCallback(() => setDmUnread(0), []);

  // useMemo sur la valeur du contexte : évite de re-render tous les consommateurs
  // du contexte à chaque render du Provider si les données n'ont pas changé
  const value = useMemo(() => ({
    rooms, currentRoom, messages, onlineUsers, typingUsers, connected, unreadCounts,
    fetchRooms, joinRoom, sendMessage, sendGiphy, sendTyping, createRoom, addMessage,
    updateRoom, deleteRoom, deleteMessage, updateMessage,
    markRoomAsRead, getTotalUnread,
    toasts, dismissToast,
    dmUnread, clearDmUnread,
    emit: emitEvent,
  }), [rooms, currentRoom, messages, onlineUsers, typingUsers, connected, unreadCounts, fetchRooms, joinRoom, sendMessage, sendGiphy, sendTyping, createRoom, addMessage, updateRoom, deleteRoom, deleteMessage, updateMessage, markRoomAsRead, getTotalUnread, toasts, dismissToast, dmUnread, clearDmUnread, emitEvent]);

  // Fusionner les données chat et WebRTC dans un seul contexte
  const contextValue = useMemo(() => ({ ...value, webrtc }), [value, webrtc]);

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
};

// Hook raccourci pour consommer le contexte dans n'importe quel composant
export const useChat = () => useContext(ChatContext);
