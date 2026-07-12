import { useEffect, useRef, useCallback } from 'react';

// URL du serveur WebSocket — définie dans .env, avec fallback local
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

// Hook personnalisé qui gère toute la connexion WebSocket
// Paramètres :
//   token      → JWT de l'utilisateur connecté (pour s'authentifier côté serveur)
//   onMessage  → fonction appelée à chaque message reçu du serveur
//   onOpen     → appelée quand la connexion s'établit
//   onClose    → appelée quand la connexion se ferme
export const useWebSocket = ({ token, onMessage, onOpen, onClose }) => {
  // useRef = boîte qui garde une valeur SANS provoquer de re-render
  const wsRef          = useRef(null); // la connexion WebSocket active
  const reconnectTimer = useRef(null); // timer de reconnexion automatique
  const attemptsRef    = useRef(0);    // compteur de tentatives de reconnexion

  // On stocke les callbacks dans des refs pour éviter que l'effet se relance
  // à chaque re-render (les fonctions sont recréées à chaque render en React)
  const onMessageRef = useRef(onMessage);
  const onOpenRef    = useRef(onOpen);
  const onCloseRef   = useRef(onClose);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onOpenRef.current    = onOpen;    }, [onOpen]);
  useEffect(() => { onCloseRef.current   = onClose;   }, [onClose]);

  const MAX_RECONNECT_ATTEMPTS = 15; // Abandonner après 15 tentatives (~10 min)

  useEffect(() => {
    // Pas de token → utilisateur non connecté → ne pas ouvrir de connexion WS
    if (!token) return;

    // Variable locale à cette exécution de l'effet
    // Si le composant est démonté (navigation, logout...), cancelled = true
    // empêche tout traitement sur une connexion abandonnée
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;

      // Ouvre la connexion WebSocket avec le token dans l'URL
      // Le serveur lira ce token pour identifier l'utilisateur
      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        attemptsRef.current = 0; // Réinitialise le compteur après une connexion réussie
        onOpenRef.current?.();
      };

      ws.onmessage = (e) => {
        if (cancelled) return;
        try {
          // e.data est une chaîne JSON, on la convertit en objet { event, data }
          onMessageRef.current?.(JSON.parse(e.data));
        } catch {
          console.error('[WS] Message non parsable');
        }
      };

      ws.onclose = (e) => {
        // Si on a fermé nous-mêmes la connexion (logout, navigation), ne pas retry
        if (cancelled) return;

        onCloseRef.current?.();

        // Code 4001 = "Non autorisé" envoyé par le serveur → pas de reconnexion
        if (e.code === 4001) {
          clearTimeout(reconnectTimer.current);
          return;
        }

        if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          console.log('[WS] Limite de reconnexion atteinte:', MAX_RECONNECT_ATTEMPTS);
          return;
        }

        // Reconnexion exponentielle : 1s, 2s, 4s, 8s, 16s... max 30s
        // Évite de saturer le serveur si beaucoup de clients se reconnectent en même temps
        const delay = Math.min(1000 * 2 ** attemptsRef.current, 30000);
        attemptsRef.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onerror = (e) => {
        if (cancelled) return;
        console.error('[WS] Erreur:', e);
        console.error('[WS] URL:', ws.url);
        console.error('[WS] ReadyState:', ws.readyState);
      };
    };

    connect(); // Lancer la première connexion

    // Fonction de nettoyage — appelée par React quand le composant est démonté
    // ou quand le token change (nouvelle connexion nécessaire)
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer.current);
      const ws = wsRef.current;
      if (ws) {
        // Détacher les handlers AVANT de fermer pour éviter que onclose
        // déclenche une reconnexion alors qu'on ferme volontairement
        ws.onopen    = null;
        ws.onmessage = null;
        ws.onerror   = null;
        ws.onclose   = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
        wsRef.current = null;
      }
    };
  }, [token]); // Se relance uniquement si le token change

  // Fonction emit — utilisée partout dans l'app pour envoyer au serveur
  // Format envoyé : { event: 'send_message', data: { roomId, content } }
  const emit = useCallback((event, data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }));
    }
    // Si la connexion est fermée, l'envoi est simplement ignoré (pas d'erreur)
  }, []);

  return { emit }; // On expose seulement emit — le reste est interne au hook
};