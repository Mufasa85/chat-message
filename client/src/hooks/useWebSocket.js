import { useEffect, useRef, useCallback } from 'react';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

export const useWebSocket = ({ token, onMessage, onOpen, onClose }) => {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const attemptsRef = useRef(0);
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const MAX_RECONNECT_ATTEMPTS = 15;

  useEffect(() => {
    if (!token) return;

    // "Génération" locale à CET effet : survit même si les refs sont
    // recréées par un démontage/remontage StrictMode, car elle vit dans
    // la closure de l'effet, pas dans un ref partagé entre montages.
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;

      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        attemptsRef.current = 0;
        onOpenRef.current?.();
      };

      ws.onmessage = (e) => {
        if (cancelled) return;
        try {
          onMessageRef.current?.(JSON.parse(e.data));
        } catch {
          console.error('[WS] Message non parsable');
        }
      };

      ws.onclose = (e) => {
        // Ne JAMAIS déclencher onClose/retry pour une socket déjà
        // invalidée par un démontage (StrictMode ou navigation).
        if (cancelled) return;

        onCloseRef.current?.();

        if (e.code === 4001) {
          clearTimeout(reconnectTimer.current);
          return;
        }
        if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          console.log('[WS] Limite de reconnexion atteinte:', MAX_RECONNECT_ATTEMPTS);
          return;
        }
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

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer.current);
      const ws = wsRef.current;
      if (ws) {
        // Détacher les handlers avant de fermer : on ne veut surtout pas
        // que onclose s'exécute pour une socket qu'on abandonne nous-mêmes.
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
        wsRef.current = null;
      }
    };
  }, [token]);

  const emit = useCallback((event, data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }));
    }
  }, []);

  return { emit };
};