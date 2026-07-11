import { useState, useRef, useCallback } from 'react';

const TURN_URL      = import.meta.env.VITE_TURN_URL;
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME;
const TURN_PASSWORD = import.meta.env.VITE_TURN_PASSWORD;

export const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    ...(TURN_URL ? [
      { urls: `turn:${TURN_URL}`,               username: TURN_USERNAME, credential: TURN_PASSWORD },
      { urls: `turn:${TURN_URL}?transport=tcp`, username: TURN_USERNAME, credential: TURN_PASSWORD },
      { urls: `turns:${TURN_URL}?transport=tcp`,username: TURN_USERNAME, credential: TURN_PASSWORD },
    ] : []),
  ],
};

export const useWebRTC = ({ currentUser, emit }) => {
  // callState: 'idle' | 'calling' | 'incoming' | 'active'
  const [callState, setCallState]   = useState('idle');
  const [callType,  setCallType]    = useState(null);   // 'audio' | 'video'
  const [remoteUser, setRemoteUser] = useState(null);   // { username, avatar }
  const [isMuted,   setIsMuted]     = useState(false);
  const [isCamOff,  setIsCamOff]    = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);

  const peerConnectionRef   = useRef(null);
  const localStreamRef      = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const targetUserIdRef     = useRef(null);   // userId de l'interlocuteur
  const pendingCallRef      = useRef(null);   // données de l'appel entrant en attente

  const localVideoRef    = useRef(null);
  const remoteVideoRef   = useRef(null);
  const remoteAudioRef   = useRef(null);
  const remoteStreamRef  = useRef(null);

  // ── Utilitaires privés ────────────────────────────────────────────────────

  const getLocalStream = useCallback(async (type) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.error('[WebRTC] Erreur accès média:', err);
      throw err;
    }
  }, []);

  const attachLocalVideo = useCallback((stream) => {
    console.log('[DEBUG] attachLocalVideo, stream=', stream, 'instanceof MediaStream:', stream instanceof MediaStream, 'localVideoRef.current=', localVideoRef.current);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
  }, []);

const attachRemoteStream = useCallback((stream) => {
  console.log('[DEBUG] attachRemoteStream, stream=', stream, 'instanceof MediaStream:', stream instanceof MediaStream);
  remoteStreamRef.current = stream;
  setRemoteStream(stream);
  if (remoteVideoRef.current) {
    remoteVideoRef.current.srcObject = stream;
  }
  if (remoteAudioRef.current) {
    remoteAudioRef.current.srcObject = stream;
  }
  console.log('[WebRTC] attachRemoteStream: video=', !!remoteVideoRef.current, 'audio=', !!remoteAudioRef.current);
}, []);

  const createPeerConnection = useCallback((targetId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        emit('ice_candidate', { targetUserId: targetId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      console.log('[WebRTC] ontrack reçu, streams:', e.streams.length, 'track kind:', e.track.kind);
      attachRemoteStream(e.streams[0]);
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    peerConnectionRef.current = pc;
    return pc;
  }, [emit, attachRemoteStream]);

  const cleanup = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    remoteStreamRef.current  = null;
    
    setRemoteStream(null);
    pendingCandidatesRef.current = [];
    targetUserIdRef.current = null;
    pendingCallRef.current  = null;
    setIsMuted(false);
    setIsCamOff(false);
  }, []);

  const flushPendingCandidates = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    for (const c of pendingCandidatesRef.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    pendingCandidatesRef.current = [];
  }, []);

  // ── API publique ──────────────────────────────────────────────────────────

  const startCall = useCallback(async (targetUser, type) => {
    try {
      const userId = targetUser?.userId || targetUser?._id || targetUser;
      console.log('[WebRTC] startCall →', { userId, type, targetUser });
      const stream = await getLocalStream(type);
      console.log('[WebRTC] stream local OK, tracks:', stream.getTracks().map(t => t.kind));
      attachLocalVideo(stream);
      targetUserIdRef.current = String(userId);

      const pc = createPeerConnection(String(userId));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[WebRTC] offer créé, envoi call_offer à', userId);

      emit('call_offer', { targetUserId: String(userId), sdp: pc.localDescription, callType: type });

      setCallType(type);
      setRemoteUser({ username: targetUser?.username, avatar: targetUser?.avatar });
      setCallState('calling');
    } catch (err) {
      console.error('[WebRTC] Erreur startCall:', err);
      cleanup();
      setCallState('idle');
    }
  }, [emit, getLocalStream, createPeerConnection, attachLocalVideo, cleanup]);

  // Appelé par le serveur quand on reçoit un appel entrant — on stocke et on affiche l'UI
  const handleIncomingCall = useCallback(({ callerId, callerName, callerAvatar, sdp, callType: type }) => {
    console.log('[WebRTC] incoming_call reçu de', callerName, '| type:', type);
    pendingCallRef.current = { callerId, callerName, callerAvatar, sdp, callType: type };
    targetUserIdRef.current = String(callerId);
    setRemoteUser({ username: callerName, avatar: callerAvatar });
    setCallType(type);
    setCallState('incoming');
  }, []);

  // L'utilisateur local accepte l'appel entrant
  const acceptCall = useCallback(async () => {
    const pending = pendingCallRef.current;
    if (!pending) return;
    const { callerId, sdp, callType: type } = pending;
    console.log('[WebRTC] acceptCall →', { callerId, type });

    try {
      const stream = await getLocalStream(type);
      console.log('[WebRTC] stream local OK (callee), tracks:', stream.getTracks().map(t => t.kind));
      attachLocalVideo(stream);

      const pc = createPeerConnection(String(callerId));
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('[WebRTC] remoteDescription set, flush candidates...');
      await flushPendingCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[WebRTC] answer créé, envoi call_answer');

      emit('call_answer', { targetUserId: String(callerId), sdp: pc.localDescription, accepted: true });

      pendingCallRef.current = null;
      setCallState('active');
    } catch (err) {
      console.error('[WebRTC] Erreur acceptCall:', err);
      cleanup();
      setCallState('idle');
    }
  }, [emit, getLocalStream, createPeerConnection, attachLocalVideo, flushPendingCandidates, cleanup]);

  // L'utilisateur local refuse l'appel entrant
  const rejectCall = useCallback(() => {
    const pending = pendingCallRef.current;
    if (pending) {
      emit('call_answer', { targetUserId: String(pending.callerId), sdp: null, accepted: false });
    }
    cleanup();
    setCallState('idle');
    setCallType(null);
    setRemoteUser(null);
  }, [emit, cleanup]);

  // Raccrocher (depuis n'importe quel état)
  const hangUp = useCallback(() => {
    if (targetUserIdRef.current) {
      emit('call_end', { targetUserId: targetUserIdRef.current, reason: 'hangup' });
    }
    cleanup();
    setCallState('idle');
    setCallType(null);
    setRemoteUser(null);
  }, [emit, cleanup]);

  // Réponse du pair distant (l'appelant reçoit ceci)
  const handleCallAnswer = useCallback(async ({ sdp, accepted }) => {
    console.log('[WebRTC] call_answer reçu | accepted:', accepted);
    if (!accepted) {
      cleanup();
      setCallState('idle');
      setCallType(null);
      setRemoteUser(null);
      return;
    }
    try {
      const pc = peerConnectionRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        console.log('[WebRTC] remoteDescription set (caller), flush candidates...');
        await flushPendingCandidates();
      }
      console.log('[WebRTC] appel actif !');
      setCallState('active');
    } catch (err) {
      console.error('[WebRTC] Erreur handleCallAnswer:', err);
    }
  }, [cleanup, flushPendingCandidates]);

  const handleIceCandidate = useCallback(async ({ candidate }) => {
    if (!candidate) return;
    const pc = peerConnectionRef.current;
    if (pc?.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('[WebRTC] ICE candidate ajouté');
      } catch (err) {
        console.warn('[WebRTC] addIceCandidate err:', err.message);
      }
    } else {
      console.log('[WebRTC] ICE candidate mis en attente (pas encore de remoteDescription)');
      pendingCandidatesRef.current.push(candidate);
    }
  }, []);

  const handleCallEnd = useCallback(() => {
    cleanup();
    setCallState('idle');
    setCallType(null);
    setRemoteUser(null);
  }, [cleanup]);

  // ── Contrôles micro / caméra ──────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsMuted((prev) => !prev);
  }, []);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsCamOff((prev) => !prev);
  }, []);

  return {
    // État UI
    callState,
    callType,
    remoteUser,
    isMuted,
    isCamOff,
    remoteStream,
    // Refs médias
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    remoteStreamRef,
    localStreamRef,
    peerConnectionRef,
    // Actions utilisateur
    startCall,
    acceptCall,
    rejectCall,
    hangUp,
    toggleMute,
    toggleCamera,
    // Handlers événements WebSocket entrants
    handleIncomingCall,
    handleCallAnswer,
    handleIceCandidate,
    handleCallEnd,
  };
};
