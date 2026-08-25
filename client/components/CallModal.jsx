import { useEffect, useRef } from "react";
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  PhoneMissed,
} from "lucide-react";

// ─── Sonnerie entrante ────────────────────────────────────────────────────────
function useRingtone(active) {
  const ctx = useRef(null);
  const interval = useRef(null);

  useEffect(() => {
    if (!active) {
      clearInterval(interval.current);
      return;
    }
    const ring = () => {
      try {
        const ac = new AudioContext();
        ctx.current = ac;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.frequency.value = 440;
        gain.gain.setValueAtTime(0.1, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.6);
        osc.start();
        osc.stop(ac.currentTime + 0.6);
      } catch {}
    };
    ring();
    interval.current = setInterval(ring, 2000);
    return () => {
      clearInterval(interval.current);
      ctx.current?.close();
    };
  }, [active]);
}

// ─── CallModal ────────────────────────────────────────────────────────────────
export default function CallModal({
  callState, // 'calling' | 'incoming' | 'active'
  callType, // 'audio' | 'video'
  remoteUser, // { username, avatar }
  currentUser: _currentUser,
  isMuted,
  isCamOff,
  localVideoRef,
  localStreamRef,
  remoteVideoRef,
  remoteAudioRef,
  remoteStream,
  peerConnection: _peerConnection,
  onAccept,
  onReject,
  onHangUp,
  onToggleMute,
  onToggleCamera,
}) {
  useRingtone(callState === "incoming");

  useEffect(() => {
    if (!remoteStream) return;
    if (remoteAudioRef?.current)
      remoteAudioRef.current.srcObject = remoteStream;
    if (remoteVideoRef?.current)
      remoteVideoRef.current.srcObject = remoteStream;
  }, [callState, remoteStream, remoteAudioRef, remoteVideoRef]);

  useEffect(() => {
    if (callState !== "active" || callType !== "video") return;
    if (!localVideoRef?.current) return;
    const stream = localStreamRef?.current;
    if (stream) {
      localVideoRef.current.srcObject = stream;
    }
  }, [callState, callType, localStreamRef, localVideoRef]);

  if (!callState || callState === "idle") return null;

  const avatar = (name, color, size = 56) => (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color || "#6366f1",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: size * 0.4,
        flexShrink: 0,
      }}
    >
      {name?.[0]?.toUpperCase()}
    </div>
  );

  // ── Appel en cours (audio only) ou en attente de réponse ──────────────────
  if (
    callState === "calling" ||
    (callState === "active" && callType === "audio")
  ) {
    return (
      <div style={s.overlay}>
        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          style={{ display: "none" }}
        />
        <div style={s.card}>
          <p style={s.subtitle}>
            {callState === "calling"
              ? "Appel en cours..."
              : "Appel audio actif"}
          </p>
          {avatar(remoteUser?.username, remoteUser?.avatar, 80)}
          <p style={s.name}>{remoteUser?.username}</p>

          <div style={s.controls}>
            <Btn
              icon={isMuted ? <MicOff size={22} /> : <Mic size={22} />}
              label={isMuted ? "Activer" : "Couper"}
              onClick={onToggleMute}
              active={isMuted}
            />
            <Btn
              icon={<PhoneOff size={22} />}
              label="Raccrocher"
              onClick={onHangUp}
              danger
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Appel entrant ──────────────────────────────────────────────────────────
  if (callState === "incoming") {
    return (
      <div style={s.overlay}>
        <div style={s.card}>
          <p style={s.subtitle}>
            Appel {callType === "video" ? "vidéo" : "audio"} entrant
          </p>
          {avatar(remoteUser?.username, remoteUser?.avatar, 80)}
          <p style={s.name}>{remoteUser?.username}</p>

          <div style={s.controls}>
            <Btn
              icon={<Phone size={22} />}
              label="Accepter"
              onClick={onAccept}
              green
            />
            <Btn
              icon={<PhoneMissed size={22} />}
              label="Refuser"
              onClick={onReject}
              danger
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Appel vidéo actif ──────────────────────────────────────────────────────
  if (callState === "active" && callType === "video") {
    return (
      <div style={s.videoOverlay}>
        {/* Vidéo distante — plein écran */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={s.remoteVideo}
        />

        {/* Miniature locale — coin bas-droite */}
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={s.localVideo}
        />

        {/* Nom du pair */}
        <div style={s.remoteName}>{remoteUser?.username}</div>

        {/* Contrôles */}
        <div style={s.videoControls}>
          <Btn
            icon={isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            label={isMuted ? "Micro off" : "Micro"}
            onClick={onToggleMute}
            active={isMuted}
            small
          />
          <Btn
            icon={isCamOff ? <VideoOff size={20} /> : <Video size={20} />}
            label={isCamOff ? "Cam off" : "Caméra"}
            onClick={onToggleCamera}
            active={isCamOff}
            small
          />
          <Btn
            icon={<PhoneOff size={20} />}
            label="Raccrocher"
            onClick={onHangUp}
            danger
            small
          />
        </div>
      </div>
    );
  }

  return null;
}

// ─── Bouton d'action ──────────────────────────────────────────────────────────
function Btn({ icon, label, onClick, danger, green, active, small }) {
  const bg = danger
    ? "#ef4444"
    : green
      ? "#22c55e"
      : active
        ? "#374151"
        : "#2d2d4e";
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        background: bg,
        border: "none",
        borderRadius: 14,
        padding: small ? "8px 14px" : "12px 20px",
        color: "#fff",
        cursor: "pointer",
        transition: "opacity .15s",
        fontSize: small ? "1.3rem" : "1.6rem",
        minWidth: small ? 72 : 90,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </span>
      <span style={{ fontSize: "0.7rem", fontWeight: 500 }}>{label}</span>
    </button>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 500,
  },
  card: {
    background: "#1a1a2e",
    borderRadius: 20,
    padding: "2.5rem 3rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
    minWidth: 300,
  },
  subtitle: { color: "#9ca3af", fontSize: "0.9rem", margin: 0 },
  name: { color: "#fff", fontWeight: 700, fontSize: "1.3rem", margin: 0 },
  controls: { display: "flex", gap: 16, marginTop: 12 },
  videoOverlay: {
    position: "fixed",
    inset: 0,
    background: "#000",
    zIndex: 500,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  remoteVideo: { width: "100%", height: "100%", objectFit: "cover" },
  localVideo: {
    position: "absolute",
    bottom: 100,
    right: 16,
    width: 140,
    height: 100,
    borderRadius: 12,
    objectFit: "cover",
    border: "2px solid #6366f1",
    boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
  },
  remoteName: {
    position: "absolute",
    top: 16,
    left: 16,
    color: "#fff",
    fontWeight: 700,
    fontSize: "0.95rem",
    background: "rgba(0,0,0,0.5)",
    padding: "4px 12px",
    borderRadius: 8,
    backdropFilter: "blur(4px)",
  },
  videoControls: {
    position: "absolute",
    bottom: 20,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: 10,
  },
};
