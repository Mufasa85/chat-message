import { useState, useRef, useCallback } from 'react';

export const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

export const useWebRTC = ({ currentUser, emit }) => {
  const [callState, setCallState] = useState({
    inCall: false,
    callType: null,
    remoteStream: null,
    localStream: null,
    caller: null,
  });

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  const getLocalStream = useCallback(async (callType) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.error('[WebRTC] Erreur accès média:', err);
      throw err;
    }
  }, []);

  const createPeerConnection = useCallback((onIceCandidate, onTrack) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        onIceCandidate(e.candidate);
      }
    };

    pc.ontrack = (e) => {
      onTrack(e.streams[0]);
    };

    // Ajouter le stream local si disponible
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    peerConnectionRef.current = pc;
    return pc;
  }, []);

  const startCall = useCallback(async (targetUserId, callType) => {
    try {
      const localStream = await getLocalStream(callType);
      
      const pc = createPeerConnection(
        (candidate) => {
          emit('ice_candidate', { targetUserId, candidate });
        },
        (remoteStream) => {
          setCallState((prev) => ({ ...prev, remoteStream }));
        }
      );

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      emit('call_offer', { targetUserId, sdp: pc.localDescription, callType });

      setCallState({
        inCall: true,
        callType,
        remoteStream: null,
        localStream,
        caller: null,
        targetUserId,
      });

      return true;
    } catch (err) {
      console.error('[WebRTC] Erreur startCall:', err);
      return false;
    }
  }, [emit, getLocalStream, createPeerConnection]);

  const handleIncomingCall = useCallback(async ({ callerId, callerName, callerAvatar, sdp, callType }) => {
    try {
      const localStream = await getLocalStream(callType);
      
      const pc = createPeerConnection(
        (candidate) => {
          emit('ice_candidate', { targetUserId: callerId, candidate });
        },
        (remoteStream) => {
          setCallState((prev) => ({ ...prev, remoteStream }));
        }
      );

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      
      // Traiter les candidats en attente
      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      pendingCandidatesRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      emit('call_answer', { targetUserId: callerId, sdp: pc.localDescription, accepted: true });

      setCallState({
        inCall: true,
        callType,
        remoteStream: null,
        localStream,
        caller: { _id: callerId, username: callerName, avatar: callerAvatar },
        targetUserId: callerId,
      });
    } catch (err) {
      console.error('[WebRTC] Erreur handleIncomingCall:', err);
    }
  }, [emit, getLocalStream, createPeerConnection]);

  const handleCallAnswer = useCallback(async ({ sdp, accepted }) => {
    if (!accepted) {
      endCall();
      return;
    }

    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        
        // Traiter les candidats en attente
        for (const candidate of pendingCandidatesRef.current) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidatesRef.current = [];
      }
    } catch (err) {
      console.error('[WebRTC] Erreur handleCallAnswer:', err);
    }
  }, []);

  const handleIceCandidate = useCallback(async ({ candidate }) => {
    if (!candidate) return;

    if (peerConnectionRef.current?.remoteDescription) {
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[WebRTC] Erreur addIceCandidate:', err);
      }
    } else {
      // Stocker le candidat en attente
      pendingCandidatesRef.current.push(candidate);
    }
  }, []);

  const handleCallEnd = useCallback(({ reason }) => {
    console.log('[WebRTC] Call ended:', reason);
    endCall();
  }, []);

  const endCall = useCallback(() => {
    // Arrêter le stream local
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Fermer la connexion peer
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Émettre l'événement de fin vers l'autre utilisateur
    if (callState.targetUserId) {
      emit('call_end', { targetUserId: callState.targetUserId, reason: 'hangup' });
    }

    setCallState({
      inCall: false,
      callType: null,
      remoteStream: null,
      localStream: null,
      caller: null,
      targetUserId: null,
    });
  }, [emit, callState.targetUserId]);

  return {
    callState,
    startCall,
    handleIncomingCall,
    handleCallAnswer,
    handleIceCandidate,
    handleCallEnd,
    endCall,
  };
};
