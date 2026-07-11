import { useState, useRef, useCallback } from 'react';
import { Mic, Square, Send, X } from 'lucide-react';

/**
 * VoiceRecorder — Enregistrement de messages vocaux
 *
 * Utilise l'API MediaRecorder du navigateur pour enregistrer le micro,
 * puis upload le fichier audio vers /api/upload (Cloudinary).
 *
 * Props :
 *   roomId    — identifiant du salon courant
 *   token     — JWT pour l'authentification
 *   onSent    — callback appelé quand le message est envoyé avec succès
 *   apiUrl    — URL de base de l'API
 */
export default function VoiceRecorder({ roomId, token, onSent, apiUrl }) {
  const [state, setState] = useState('idle'); // idle | recording | preview | uploading
  const [audioUrl, setAudioUrl] = useState(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg',
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState('preview');
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start(200);
      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setState('recording');

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch {
      setError('Microphone inaccessible — vérifiez les permissions.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    blobRef.current = null;
    setAudioUrl(null);
    setDuration(0);
    setError(null);
    setState('idle');
  }, [audioUrl]);

  const send = useCallback(async () => {
    if (!blobRef.current || !roomId) return;
    setState('uploading');
    try {
      const ext = blobRef.current.type.includes('webm') ? 'webm' : 'ogg';
      const file = new File([blobRef.current], `voice_${Date.now()}.${ext}`, {
        type: blobRef.current.type,
      });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('roomId', roomId);
      formData.append('caption', 'Message vocal');

      const res = await fetch(`${apiUrl}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error("Échec de l'envoi");

      const message = await res.json();
      onSent?.(message);

      URL.revokeObjectURL(audioUrl);
      blobRef.current = null;
      setAudioUrl(null);
      setDuration(0);
      setState('idle');
    } catch (err) {
      setError("Erreur lors de l'envoi : " + err.message);
      setState('preview');
    }
  }, [roomId, token, apiUrl, audioUrl, onSent]);

  const formatDuration = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const st = {
    container: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(51,65,85,0.55)', borderRadius: 12 },
    btn: (color) => ({ background: color, border: 'none', borderRadius: '50%', width: 38, height: 38, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, transition: 'opacity .15s' }),
    timer: { color: '#ef4444', fontWeight: 700, fontSize: '0.9rem', minWidth: 40 },
    pulse: { width: 9, height: 9, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' },
    error: { color: '#ef4444', fontSize: '0.82rem', marginTop: 4 },
    audio: { flex: 1, height: 32 },
  };

  if (state === 'idle') return (
    <button onClick={startRecording} style={st.btn('#6366f1')} title="Enregistrer un message vocal">
      <Mic size={18} />
    </button>
  );

  if (state === 'recording') return (
    <div style={st.container}>
      <div style={st.pulse} />
      <span style={st.timer}>{formatDuration(duration)}</span>
      <span style={{ color: '#9ca3af', fontSize: '0.85rem', flex: 1 }}>Enregistrement...</span>
      <button onClick={stopRecording} style={st.btn('#ef4444')} title="Arrêter"><Square size={16} /></button>
      <button onClick={cancel} style={st.btn('#4b5563')} title="Annuler"><X size={16} /></button>
    </div>
  );

  if (state === 'preview') return (
    <div style={{ ...st.container, flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Mic size={18} style={{ color: '#6366f1', flexShrink: 0 }} />
        <audio src={audioUrl} controls style={st.audio} />
        <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{formatDuration(duration)}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={send} style={{ flex: 1, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Send size={15} /> Envoyer
        </button>
        <button onClick={cancel} style={{ flex: 1, background: '#4b5563', color: '#fff', border: 'none', borderRadius: 8, padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <X size={15} /> Annuler
        </button>
      </div>
      {error && <p style={st.error}>{error}</p>}
    </div>
  );

  if (state === 'uploading') return (
    <div style={st.container}>
      <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Envoi en cours...</span>
    </div>
  );

  return null;
}
