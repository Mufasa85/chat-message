import { useState, useRef, useCallback } from "react";

// Clé API Metered.ca pour récupérer les credentials TURN dynamiques
const METERED_API_KEY = import.meta.env.VITE_METERED_API_KEY;

// Cache en mémoire — on ne fetch qu'une seule fois par session
let cachedIceServers = null;

// Récupère les serveurs ICE (STUN + TURN) depuis l'API Metered
// STUN = découvrir son IP publique (gratuit, Google)
// TURN = serveur relais si connexion directe impossible (réseaux différents, 4G ↔ WiFi)
async function fetchIceServers() {
  if (cachedIceServers) return cachedIceServers; // Utiliser le cache si déjà fetchés
  try {
    const res = await fetch(
      `https://chat-message.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`,
    );
    const servers = await res.json(); // Liste de { urls, username, credential }
    cachedIceServers = {
      iceServers: servers,
      iceCandidatePoolSize: 10, // Pré-collecte 10 candidats réseau avant l'appel → moins de délai
      bundlePolicy: "max-bundle", // Audio + vidéo sur UN seul port réseau (plus rapide)
      rtcpMuxPolicy: "require", // RTP et RTCP sur le même port (moins de connexions)
    };
  } catch {
    // Si Metered échoue → fallback STUN Google (connexions simples seulement)
    cachedIceServers = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    };
  }
  return cachedIceServers;
}

// Config ICE de base (fallback statique si fetchIceServers n'a pas encore résolu)
export const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

// Hook qui gère toute la logique d'appel vidéo/audio WebRTC
// emit → fonction WebSocket pour envoyer les signaux à l'autre utilisateur
export const useWebRTC = ({ currentUser: _currentUser, emit }) => {
  // ── États UI — pilotent l'affichage du CallModal ───────────────────────────
  // 'idle'     → pas d'appel
  // 'calling'  → on a lancé un appel, on attend la réponse
  // 'incoming' → on reçoit un appel, on choisit d'accepter ou refuser
  // 'active'   → appel en cours
  const [callState, setCallState] = useState("idle");
  const [callType, setCallType] = useState(null); // 'audio' | 'video'
  const [remoteUser, setRemoteUser] = useState(null); // { username, avatar } de l'interlocuteur
  const [isMuted, setIsMuted] = useState(false); // micro coupé ?
  const [isCamOff, setIsCamOff] = useState(false); // caméra coupée ?
  const [remoteStream, setRemoteStream] = useState(null); // flux vidéo/audio de l'autre

  // ── Refs — données persistantes sans re-render ─────────────────────────────
  const peerConnectionRef = useRef(null); // L'objet RTCPeerConnection actif
  const localStreamRef = useRef(null); // Notre flux caméra/micro
  const pendingCandidatesRef = useRef([]); // Candidats ICE reçus avant remoteDescription
  const targetUserIdRef = useRef(null); // userId de l'interlocuteur
  const pendingCallRef = useRef(null); // Données de l'appel entrant en attente d'acceptation

  // Refs vers les éléments <video> et <audio> du DOM
  const localVideoRef = useRef(null); // Notre propre vidéo (coin)
  const remoteVideoRef = useRef(null); // Vidéo de l'autre (grande)
  const remoteAudioRef = useRef(null); // Audio de l'autre (appel audio uniquement)
  const remoteStreamRef = useRef(null); // Copie ref du stream distant (accès sans re-render)

  // ── Utilitaires privés ────────────────────────────────────────────────────

  // Demande l'accès à la caméra et au micro du navigateur
  // Le navigateur affiche la popup "Autoriser l'accès à la caméra ?"
  const getLocalStream = useCallback(async (type) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true, // Annule l'écho (évite le larsen)
          noiseSuppression: true, // Filtre le bruit de fond (clavier, ventilo...)
          autoGainControl: true, // Ajuste automatiquement le volume du micro
          sampleRate: 48000, // Qualité audio CD (48 kHz)
          channelCount: 1, // Mono — réduit la bande passante
        },
        video:
          type === "video"
            ? {
                width: { ideal: 640, max: 1280 }, // 640px idéal, 1280px max
                height: { ideal: 480, max: 720 }, // 480px idéal, 720px max
                frameRate: { ideal: 24, max: 30 }, // 24 fps = fluide et léger
                facingMode: "user", // Caméra frontale sur mobile
              }
            : false, // false = pas de vidéo pour un appel audio
      });
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.error("[WebRTC] Erreur accès média:", err);
      throw err; // Remonté à startCall/acceptCall qui affiche l'erreur
    }
  }, []);

  // Branche notre propre flux vidéo/audio sur l'élément <video> local (miniature)
  const attachLocalVideo = useCallback((stream) => {
    console.log(
      "[DEBUG] attachLocalVideo, stream=",
      stream,
      "instanceof MediaStream:",
      stream instanceof MediaStream,
      "localVideoRef.current=",
      localVideoRef.current,
    );
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream; // srcObject = flux MediaStream directement dans <video>
    }
  }, []);

  // Branche le flux de l'interlocuteur sur les éléments <video>/<audio> distants
  const attachRemoteStream = useCallback((stream) => {
    console.log(
      "[DEBUG] attachRemoteStream, stream=",
      stream,
      "instanceof MediaStream:",
      stream instanceof MediaStream,
    );
    remoteStreamRef.current = stream;
    setRemoteStream(stream); // Déclenche un re-render pour afficher la vidéo
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream; // Vidéo de l'autre
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream; // Audio de l'autre (appel audio)
    }
    console.log(
      "[WebRTC] attachRemoteStream: video=",
      !!remoteVideoRef.current,
      "audio=",
      !!remoteAudioRef.current,
    );
  }, []);

  // Crée et configure la connexion WebRTC avec l'interlocuteur
  // C'est le cœur du système d'appel — cette fonction configure tous les handlers
  const createPeerConnection = useCallback(
    async (targetId) => {
      const iceConfig = await fetchIceServers(); // Récupère STUN + TURN de Metered
      const pc = new RTCPeerConnection(iceConfig);

      // Quand le navigateur découvre une adresse réseau (candidat ICE),
      // on l'envoie à l'autre via WebSocket pour qu'il puisse nous trouver
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          emit("ice_candidate", {
            targetUserId: targetId,
            candidate: e.candidate,
          });
        }
      };

      // Suivi de l'état de la connexion globale
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log("[WebRTC] connectionState:", state);
        if (state === "connected") {
          setCallState("active");
          // Limiter le débit pour éviter les freezes sur réseau mobile
          // Sans cette limite, le navigateur peut envoyer jusqu'à 4 Mbps → sature la 4G
          pc.getSenders().forEach(async (sender) => {
            if (!sender.track) return;
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            if (sender.track.kind === "video") {
              params.encodings[0].maxBitrate = 500_000; // Max 500 kbps pour la vidéo
              params.encodings[0].maxFramerate = 24; // Max 24 images/seconde
              params.encodings[0].scaleResolutionDownBy = 1; // Pas de réduction de résolution
            } else if (sender.track.kind === "audio") {
              params.encodings[0].maxBitrate = 64_000; // Max 64 kbps pour l'audio
            }
            try {
              await sender.setParameters(params);
            } catch {}
          });
        }
        // En cas d'échec ou de coupure réseau → relancer la négociation ICE automatiquement
        if (state === "failed" || state === "disconnected") {
          pc.restartIce();
        }
      };

      // Suivi de l'état ICE (collecte des candidats réseau)
      pc.oniceconnectionstatechange = () => {
        console.log("[WebRTC] iceConnectionState:", pc.iceConnectionState);
      };

      // Quand on reçoit le flux média de l'autre (vidéo + audio)
      // e.streams[0] = le MediaStream complet de l'interlocuteur
      pc.ontrack = (e) => {
        console.log(
          "[WebRTC] ontrack reçu, streams:",
          e.streams.length,
          "track kind:",
          e.track.kind,
        );
        attachRemoteStream(e.streams[0]);
      };

      // Ajouter nos propres pistes (caméra, micro) à la connexion
      // Sans ça, l'autre ne nous verrait/entendrait pas
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      peerConnectionRef.current = pc;
      return pc;
    },
    [emit, attachRemoteStream],
  );

  // Nettoie tout après un appel (libère les ressources système)
  // IMPORTANT : .stop() sur les tracks libère la caméra/micro (le voyant rouge s'éteint)
  const cleanup = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop()); // Libère caméra et micro
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close(); // Ferme la connexion WebRTC
      peerConnectionRef.current = null;
    }
    // Détacher les flux des éléments <video>/<audio> DOM
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    remoteStreamRef.current = null;

    // Remettre tous les états à zéro
    setRemoteStream(null);
    pendingCandidatesRef.current = [];
    targetUserIdRef.current = null;
    pendingCallRef.current = null;
    setIsMuted(false);
    setIsCamOff(false);
  }, []);

  // Applique les candidats ICE qui sont arrivés AVANT que la remoteDescription soit prête
  // Problème courant : les candidats ICE arrivent parfois avant le SDP de l'offre/réponse
  // Solution : les mettre en file d'attente et les appliquer une fois le SDP reçu
  const flushPendingCandidates = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    for (const c of pendingCandidatesRef.current) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {}
    }
    pendingCandidatesRef.current = []; // Vider la file après traitement
  }, []);

  // ── API publique — actions de l'utilisateur ───────────────────────────────

  // Lance un appel vers un autre utilisateur
  // Étapes : accès média → connexion → offre SDP → envoi via WebSocket
  const startCall = useCallback(
    async (targetUser, type) => {
      try {
        const userId = targetUser?.userId || targetUser?._id || targetUser;
        console.log("[WebRTC] startCall →", { userId, type, targetUser });

        const stream = await getLocalStream(type); // 1. Accès caméra/micro
        attachLocalVideo(stream); // 2. Afficher notre vidéo (miniature)
        targetUserIdRef.current = String(userId);

        const pc = await createPeerConnection(String(userId)); // 3. Créer la connexion
        const offer = await pc.createOffer(); // 4. Créer l'offre SDP
        await pc.setLocalDescription(offer); // 5. Enregistrer localement

        // 6. Envoyer l'offre à l'autre via WebSocket (le serveur la transmet)
        emit("call_offer", {
          targetUserId: String(userId),
          sdp: pc.localDescription,
          callType: type,
        });

        setCallType(type);
        setRemoteUser({
          username: targetUser?.username,
          avatar: targetUser?.avatar,
        });
        setCallState("calling"); // → l'UI affiche "Appel en cours..."
      } catch (err) {
        console.error("[WebRTC] Erreur startCall:", err);
        cleanup();
        setCallState("idle");
      }
    },
    [emit, getLocalStream, createPeerConnection, attachLocalVideo, cleanup],
  );

  // Reçoit un appel entrant depuis le serveur WebSocket
  // On stocke les données de l'appel en attente et on affiche la notification
  // L'utilisateur choisit ensuite acceptCall() ou rejectCall()
  const handleIncomingCall = useCallback(
    ({ callerId, callerName, callerAvatar, sdp, callType: type }) => {
      console.log(
        "[WebRTC] incoming_call reçu de",
        callerName,
        "| type:",
        type,
      );
      pendingCallRef.current = {
        callerId,
        callerName,
        callerAvatar,
        sdp,
        callType: type,
      };
      targetUserIdRef.current = String(callerId);
      setRemoteUser({ username: callerName, avatar: callerAvatar });
      setCallType(type);
      setCallState("incoming"); // → l'UI affiche la notification d'appel entrant
    },
    [],
  );

  // L'utilisateur accepte l'appel entrant
  // Étapes symétriques à startCall mais du côté receveur
  const acceptCall = useCallback(async () => {
    const pending = pendingCallRef.current;
    if (!pending) return;
    const { callerId, sdp, callType: type } = pending;
    console.log("[WebRTC] acceptCall →", { callerId, type });

    try {
      const stream = await getLocalStream(type); // 1. Accès caméra/micro
      attachLocalVideo(stream); // 2. Afficher notre vidéo

      const pc = await createPeerConnection(String(callerId)); // 3. Créer la connexion
      await pc.setRemoteDescription(new RTCSessionDescription(sdp)); // 4. Enregistrer l'offre reçue
      await flushPendingCandidates(); // 5. Appliquer les ICE en attente

      const answer = await pc.createAnswer(); // 6. Créer notre réponse SDP
      await pc.setLocalDescription(answer); // 7. Enregistrer localement

      // 8. Envoyer la réponse à l'appelant via WebSocket
      emit("call_answer", {
        targetUserId: String(callerId),
        sdp: pc.localDescription,
        accepted: true,
      });

      pendingCallRef.current = null;
      setCallState("active"); // → l'UI affiche la fenêtre d'appel
    } catch (err) {
      console.error("[WebRTC] Erreur acceptCall:", err);
      cleanup();
      setCallState("idle");
    }
  }, [
    emit,
    getLocalStream,
    createPeerConnection,
    attachLocalVideo,
    flushPendingCandidates,
    cleanup,
  ]);

  // Refuse l'appel entrant et notifie l'appelant
  const rejectCall = useCallback(() => {
    const pending = pendingCallRef.current;
    if (pending) {
      // Envoyer accepted: false → l'appelant voit "Appel refusé"
      emit("call_answer", {
        targetUserId: String(pending.callerId),
        sdp: null,
        accepted: false,
      });
    }
    cleanup();
    setCallState("idle");
    setCallType(null);
    setRemoteUser(null);
  }, [emit, cleanup]);

  // Raccrocher — utilisable depuis n'importe quel état (calling, active...)
  const hangUp = useCallback(() => {
    if (targetUserIdRef.current) {
      emit("call_end", {
        targetUserId: targetUserIdRef.current,
        reason: "hangup",
      });
    }
    cleanup();
    setCallState("idle");
    setCallType(null);
    setRemoteUser(null);
  }, [emit, cleanup]);

  // ── Handlers événements WebSocket entrants ────────────────────────────────

  // L'appelant reçoit la réponse de l'appelé (accepté ou refusé)
  const handleCallAnswer = useCallback(
    async ({ sdp, accepted }) => {
      console.log("[WebRTC] call_answer reçu | accepted:", accepted);
      if (!accepted) {
        // L'autre a refusé → nettoyer
        cleanup();
        setCallState("idle");
        setCallType(null);
        setRemoteUser(null);
        return;
      }
      try {
        const pc = peerConnectionRef.current;
        if (pc) {
          // Enregistrer la réponse SDP de l'appelé → compléter la négociation
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushPendingCandidates(); // Appliquer les candidats ICE en attente
        }
        console.log("[WebRTC] appel actif !");
        setCallState("active");
      } catch (err) {
        console.error("[WebRTC] Erreur handleCallAnswer:", err);
      }
    },
    [cleanup, flushPendingCandidates],
  );

  // Reçoit un candidat ICE de l'autre — adresse réseau pour établir la connexion
  const handleIceCandidate = useCallback(async ({ candidate }) => {
    if (!candidate) return;
    const pc = peerConnectionRef.current;
    if (pc?.remoteDescription) {
      // remoteDescription présente → on peut appliquer le candidat immédiatement
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("[WebRTC] ICE candidate ajouté");
      } catch (err) {
        console.warn("[WebRTC] addIceCandidate err:", err.message);
      }
    } else {
      // Pas encore de remoteDescription → mettre en file d'attente
      // flushPendingCandidates() les appliquera après setRemoteDescription
      console.log(
        "[WebRTC] ICE candidate mis en attente (pas encore de remoteDescription)",
      );
      pendingCandidatesRef.current.push(candidate);
    }
  }, []);

  // L'autre a raccroché → nettoyer notre côté
  const handleCallEnd = useCallback(() => {
    cleanup();
    setCallState("idle");
    setCallType(null);
    setRemoteUser(null);
  }, [cleanup]);

  // ── Contrôles micro / caméra ──────────────────────────────────────────────

  // Coupe/découpe le micro — t.enabled = false = silence (la track reste active, juste muette)
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled; // false = muet, true = actif
    });
    setIsMuted((prev) => !prev);
  }, []);

  // Active/désactive la caméra — même principe que le micro
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
