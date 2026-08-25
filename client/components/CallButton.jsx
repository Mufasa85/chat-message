import { Mic, Video } from "lucide-react";

export default function CallButton({ user, onCall }) {
  if (!user) return null;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button
        style={s.btn}
        onClick={() => onCall(user, "audio")}
        title={`Appel audio avec ${user.username}`}
      >
        <Mic size={16} />
      </button>
      <button
        style={s.btn}
        onClick={() => onCall(user, "video")}
        title={`Appel vidéo avec ${user.username}`}
      >
        <Video size={16} />
      </button>
    </div>
  );
}

const s = {
  btn: {
    background: "none",
    border: "none",
    fontSize: "1rem",
    cursor: "pointer",
    padding: "4px 6px",
    borderRadius: 6,
    color: "#9ca3af",
    transition: "background .15s",
    lineHeight: 1,
  },
};
