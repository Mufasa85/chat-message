import { useEffect, useRef, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

export const useWebSocket = ({ token, onMessage, onOpen, onClose }) => {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const attemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (!token) return;
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen  = () => { attemptsRef.current = 0; onOpen?.(); };
    ws.onmessage = (e) => {
      try { onMessage?.(JSON.parse(e.data)); } catch { console.error('[WS] Message non parsable'); }
    };
    ws.onclose = () => {
      onClose?.();
      const delay = Math.min(1000 * 2 ** attemptsRef.current, 30000);
      attemptsRef.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };
    ws.onerror = (e) => console.error('[WS] Erreur:', e);
  }, [token, onMessage, onOpen, onClose]);

  useEffect(() => {
    connect();
    return () => { clearTimeout(reconnectTimer.current); wsRef.current?.close(); };
  }, [connect]);

  const emit = useCallback((event, data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ event, data }));
  }, []);

  return { emit };
};