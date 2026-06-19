import { useState, useRef, useCallback, useEffect } from 'react';

// Serveurs STUN publics (Google) + TURN de secours si configuré
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Ajouter un serveur TURN ici pour les réseaux restrictifs :
    // { urls: 'turn:your-turn-server.com:3478', username: 'user', credential: 'pass' },
  ],
};

export const useWebRTC = ({ currentUser, emit, onCallStateChange }) => {
  const [callState, setCallState]     = useState('idle'); // idle | calling | incoming | active
  const [callType,  setCallType]      = useState(null);   // 'audio' | 'video'
  const [remoteUser, setRemoteUser]   = useState(null);   // { userId, username, avatar }
  const [isMuted,   setIsMuted]       = useState(false);
  const [isCamOff,  setIsCamOff]      = useState(false);

  const pcRef         = useRef(null); // RTCPeerConnection
  const localStream   = useRef(null); // MediaStream local
  const remoteStream  = useRef(null); // MediaStream distant
  const localVideoRef = useRef(null); // <video> local
  const remoteVideoRef= useRef(null); // <video> distant
  const pendingSdp    = useRef(null); // SDP offer reçue avant d'accepter
  const pendingCandidates = useRef([]); // ICE candidates reçus avant remoteDesc

  // ─── Utilitaires ───────────────────────────────────────────────────────────

  const updateState = useCallback((s) => {
    setCallState(s);
    onCallStateChange?.(s);
  }, [onCallStateChange]);

  const getMedia = useCallback(async (type) => {
    const constraints = {
      audio: true,
      video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }, []);

  const createPeerConnection = useCallback((targetUserId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Envoyer les candidats ICE au pair distant dès qu'ils arrivent
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        emit('ice_candidate', { targetUserId, candidate });
      }
    };

    // Recevoir les tracks distantes
    pc.ontrack = ({ streams }) => {
      remoteStream.current = streams[0];
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        hangUp(false);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [emit]);

  const cleanUp = useCallback(() => {
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current  = null;
    remoteStream.current = null;
    pendingSdp.current   = null;
    pendingCandidates.current = [];
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setIsMuted(false);
    setIsCamOff(false);
  }, []);

  // ─── Initier un appel ──────────────────────────────────────────────────────

  const startCall = useCallback(async (targetUser, type = 'video') => {
    try {
      setCallType(type);
      setRemoteUser(targetUser);
      updateState('calling');

      const stream = await getMedia(type);
      localStream.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection(targetUser.userId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      emit('call_offer', {
        targetUserId: targetUser.userId,
        sdp:  pc.localDescription,
        callType: type,
      });
    } catch (err) {
      console.error('[WebRTC] startCall:', err);
      cleanUp();
      updateState('idle');
    }
  }, [emit, getMedia, createPeerConnection, cleanUp, updateState]);

  // ─── Accepter un appel entrant ─────────────────────────────────────────────

  const acceptCall = useCallback(async () => {
    if (!pendingSdp.current || !remoteUser) return;
    try {
      const stream = await getMedia(callType);
      localStream.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection(remoteUser.userId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(pendingSdp.current));

      // Appliquer les ICE candidates mis en attente
      for (const c of pendingCandidates.current) {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingCandidates.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      emit('call_answer', {
        targetUserId: remoteUser.userId,
        sdp:      pc.localDescription,
        accepted: true,
      });

      updateState('active');
    } catch (err) {
      console.error('[WebRTC] acceptCall:', err);
      rejectCall();
    }
  }, [callType, remoteUser, emit, getMedia, createPeerConnection, updateState]);

  // ─── Refuser un appel ─────────────────────────────────────────────────────

  const rejectCall = useCallback(() => {
    if (remoteUser) {
      emit('call_answer', { targetUserId: remoteUser.userId, accepted: false });
    }
    cleanUp();
    setRemoteUser(null);
    setCallType(null);
    updateState('idle');
  }, [remoteUser, emit, cleanUp, updateState]);

  // ─── Raccrocher ───────────────────────────────────────────────────────────

  const hangUp = useCallback((notifyPeer = true) => {
    if (notifyPeer && remoteUser) {
      emit('call_end', { targetUserId: remoteUser.userId, reason: 'hangup' });
    }
    cleanUp();
    setRemoteUser(null);
    setCallType(null);
    updateState('idle');
  }, [remoteUser, emit, cleanUp, updateState]);

  // ─── Micro / caméra ───────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const audioTrack = localStream.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, []);

  const toggleCamera = useCallback(() => {
    const videoTrack = localStream.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsCamOff(!videoTrack.enabled);
    }
  }, []);

  // ─── Réception des events WebRTC (appelé depuis ChatContext) ──────────────

  const handleIncomingCall = useCallback(({ callerId, callerName, callerAvatar, sdp, callType: type }) => {
    if (callState !== 'idle') {
      // Déjà en appel — refuser automatiquement
      emit('call_answer', { targetUserId: callerId, accepted: false });
      return;
    }
    pendingSdp.current = sdp;
    setCallType(type);
    setRemoteUser({ userId: callerId, username: callerName, avatar: callerAvatar });
    updateState('incoming');
  }, [callState, emit, updateState]);

  const handleCallAnswer = useCallback(async ({ accepted, sdp }) => {
    if (!accepted) {
      cleanUp();
      setRemoteUser(null);
      setCallType(null);
      updateState('idle');
      return;
    }
    try {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(sdp));
      for (const c of pendingCandidates.current) {
        await pcRef.current?.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingCandidates.current = [];
      updateState('active');
    } catch (err) {
      console.error('[WebRTC] handleCallAnswer:', err);
    }
  }, [cleanUp, updateState]);

  const handleIceCandidate = useCallback(async ({ candidate }) => {
    if (!pcRef.current || !pcRef.current.remoteDescription) {
      pendingCandidates.current.push(candidate);
      return;
    }
    try {
      await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[WebRTC] addIceCandidate:', err);
    }
  }, []);

  const handleCallEnd = useCallback(() => {
    cleanUp();
    setRemoteUser(null);
    setCallType(null);
    updateState('idle');
  }, [cleanUp, updateState]);

  return {
    callState, callType, remoteUser,
    isMuted, isCamOff,
    localVideoRef, remoteVideoRef,
    startCall, acceptCall, rejectCall, hangUp,
    toggleMute, toggleCamera,
    // handlers à brancher dans ChatContext
    handleIncomingCall, handleCallAnswer, handleIceCandidate, handleCallEnd,
  };
};