import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// ── SVG Icons ────────────────────────────────────────────────────
const Ic = {
  users: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  rooms: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  stats: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  close: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  edit: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  trash: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  ),
  ban: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  ),
  disable: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18.36 6.64A9 9 0 0 1 20.77 15" />
      <path d="M6.16 6.16a9 9 0 1 0 12.68 12.68" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  ),
  key: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  ),
  plus: () => (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  search: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  refresh: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  ),
  msg: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  members: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  ),
};

const formatDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const formatTime = (d) =>
  d
    ? new Date(d).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const STATUS_COLORS = {
  online: "#10b981",
  busy: "#f59e0b",
  invisible: "#6b7280",
  offline: "#6b7280",
};
// ── Petit composant Feedback ─────────────────────────────────────
function Msg({ msg }) {
  if (!msg) return null;
  const ok = msg.type === "success";
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        fontSize: "0.85rem",
        marginTop: 10,
        background: ok ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
        color: ok ? "#10b981" : "#ef4444",
        border: `1px solid ${ok ? "#10b981" : "#ef4444"}33`,
      }}
    >
      {msg.text}
    </div>
  );
}

// ── Composant Modal générique ────────────────────────────────────
function Modal({ title, onClose, children, width = 500 }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 400,
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#16162a",
          borderRadius: 16,
          width: "100%",
          maxWidth: width,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 22px 0",
          }}
        >
          <h3
            style={{
              color: "#f1f5f9",
              fontWeight: 700,
              fontSize: "1.05rem",
              margin: 0,
            }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "none",
              color: "#9ca3af",
              width: 30,
              height: 30,
              borderRadius: 7,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ic.close />
          </button>
        </div>
        <div style={{ padding: "18px 22px 22px" }}>{children}</div>
      </div>
    </div>
  );
}

// ── Détection mobile ─────────────────────────────────────────────
const isMobile = () => window.innerWidth < 640;

// ── Styles partagés ──────────────────────────────────────────────
const S = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.72)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 300,
  },
  panel: {
    background: "#111827",
    width: "100%",
    maxWidth: 1100,
    borderRadius: "20px 20px 0 0",
    display: "flex",
    flexDirection: "column",
    height: "90vh",
    overflow: "hidden",
    boxShadow: "0 -8px 40px rgba(0,0,0,0.7)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  header: {
    background: "#1f2937",
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    flexShrink: 0,
  },
  sidebar: {
    width: 180,
    background: "#1a1f2e",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    flexShrink: 0,
  },
  content: { flex: 1, overflowY: "auto", padding: 16 },
  navBtn: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "10px 14px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: "0.86rem",
    fontWeight: active ? 600 : 400,
    background: active ? "rgba(99,102,241,0.2)" : "transparent",
    color: active ? "#a5b4fc" : "#9ca3af",
    marginBottom: 2,
  }),
  mobileNavBtn: (active) => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    flex: 1,
    padding: "8px 4px",
    border: "none",
    background: "transparent",
    color: active ? "#a5b4fc" : "#6b7280",
    cursor: "pointer",
    fontSize: "0.65rem",
    fontWeight: active ? 600 : 400,
  }),
  input: {
    width: "100%",
    background: "#1e2538",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 9,
    color: "#f1f5f9",
    padding: "9px 13px",
    fontSize: "0.9rem",
    outline: "none",
    boxSizing: "border-box",
  },
  label: {
    color: "#9ca3af",
    fontSize: "0.8rem",
    display: "block",
    marginBottom: 5,
  },
  btn: (c = "#6366f1", sm = false) => ({
    background: c,
    border: "none",
    borderRadius: 8,
    color: "#fff",
    padding: sm ? "6px 12px" : "9px 18px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: sm ? "0.8rem" : "0.88rem",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  }),
  row: { display: "flex", gap: 12, marginBottom: 12 },
  card: {
    background: "#1a1f2e",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: "16px 20px",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    color: "#6b7280",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "8px 10px",
    textAlign: "left",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  td: {
    padding: "10px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    color: "#d1d5db",
    fontSize: "0.87rem",
    verticalAlign: "middle",
  },
  badge: (c = "#6366f1") => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 9px",
    borderRadius: 20,
    fontSize: "0.73rem",
    fontWeight: 600,
    background: c + "22",
    color: c,
    border: `1px solid ${c}44`,
  }),
  avatar: (color) => ({
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: color || "#6366f1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 700,
    fontSize: "0.85rem",
    flexShrink: 0,
  }),
  statCard: (c = "#6366f1") => ({
    background: "#1a1f2e",
    border: `1px solid ${c}33`,
    borderRadius: 12,
    padding: "16px 20px",
    flex: 1,
  }),
  iconBox: (c = "#6366f1") => ({
    width: 40,
    height: 40,
    borderRadius: 10,
    background: c + "22",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  }),
};

// ════════════════════════════════════════════════════════════════
// Onglet : Statistiques
// ════════════════════════════════════════════════════════════════
function TabStats({ token }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) setStats(await r.json());
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading)
    return (
      <p style={{ color: "#6b7280", textAlign: "center", padding: 40 }}>
        Chargement...
      </p>
    );
  if (!stats) return <p style={{ color: "#ef4444" }}>Erreur de chargement</p>;

  const cards = [
    {
      label: "Utilisateurs",
      value: stats.totalUsers,
      color: "#6366f1",
      icon: <Ic.users />,
    },
    {
      label: "Connectés",
      value: stats.onlineUsers,
      color: "#10b981",
      icon: <Ic.stats />,
    },
    {
      label: "Messages total",
      value: stats.totalMessages,
      color: "#f59e0b",
      icon: <Ic.rooms />,
    },
    {
      label: "Messages / jour",
      value: stats.messagesToday,
      color: "#ec4899",
      icon: <Ic.msg />,
    },
    {
      label: "Salons",
      value: stats.totalRooms,
      color: "#8b5cf6",
      icon: <Ic.rooms />,
    },
    {
      label: "Admins",
      value: stats.adminCount,
      color: "#14b8a6",
      icon: <Ic.users />,
    },
    {
      label: "Bannis",
      value: stats.bannedUsers,
      color: "#ef4444",
      icon: <Ic.ban />,
    },
    {
      label: "Désactivés",
      value: stats.disabledUsers,
      color: "#f97316",
      icon: <Ic.disable />,
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <h2
          style={{
            color: "#f1f5f9",
            fontWeight: 700,
            fontSize: "1.1rem",
            margin: 0,
          }}
        >
          Vue d'ensemble
        </h2>
        <button onClick={load} style={S.btn("#374151", true)}>
          <Ic.refresh /> Rafraîchir
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        {cards.map(({ label, value, color, icon }) => (
          <div key={label} style={S.statCard(color)}>
            <div style={S.iconBox(color)}>
              <span style={{ color }}>{icon}</span>
            </div>
            <p
              style={{
                color: "#9ca3af",
                fontSize: "0.78rem",
                margin: "0 0 4px",
              }}
            >
              {label}
            </p>
            <p
              style={{
                color: "#f1f5f9",
                fontSize: "1.5rem",
                fontWeight: 700,
                margin: 0,
              }}
            >
              {value ?? "—"}
            </p>
          </div>
        ))}
      </div>
      <p style={{ color: "#4b5563", fontSize: "0.75rem", marginTop: 16 }}>
        Généré le {new Date(stats.generatedAt).toLocaleString("fr-FR")}
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Modal : Éditer un utilisateur (admin)
// ════════════════════════════════════════════════════════════════
function ModalEditUser({ user, token, onClose, onSaved }) {
  const [form, setForm] = useState({
    fullName: user.fullName || "",
    email: user.email || "",
    phone: user.phone || "",
    bio: user.bio || "",
    role: user.role || "user",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`${API}/admin/users/${user._id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMsg({ type: "success", text: "Modifications sauvegardées" });
      onSaved(d);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
    setSaving(false);
  };

  return (
    <Modal title={`Modifier — ${user.username}`} onClose={onClose}>
      {[
        ["Nom complet", "fullName", "text"],
        ["Email", "email", "email"],
        ["Téléphone", "phone", "tel"],
        ["Bio", "bio", "text"],
      ].map(([lbl, key, type]) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <label style={S.label}>{lbl}</label>
          <input
            type={type}
            value={form[key]}
            onChange={set(key)}
            style={S.input}
          />
        </div>
      ))}
      <div style={{ marginBottom: 14 }}>
        <label style={S.label}>Rôle</label>
        <select value={form.role} onChange={set("role")} style={{ ...S.input }}>
          <option value="user">Utilisateur</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <button onClick={save} disabled={saving} style={S.btn()}>
        {saving ? "Sauvegarde..." : "Enregistrer"}
      </button>
      <Msg msg={msg} />
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// Modal : Réinitialiser le mot de passe
// ════════════════════════════════════════════════════════════════
function ModalResetPwd({ user, token, onClose }) {
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const reset = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`${API}/admin/users/${user._id}/reset-password`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newPassword: pwd }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMsg({ type: "success", text: d.message });
      setPwd("");
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
    setSaving(false);
  };

  return (
    <Modal
      title={`Réinitialiser — ${user.username}`}
      onClose={onClose}
      width={400}
    >
      <label style={S.label}>Nouveau mot de passe</label>
      <input
        type="password"
        value={pwd}
        onChange={(e) => setPwd(e.target.value)}
        placeholder="Min. 6 caractères"
        style={{ ...S.input, marginBottom: 14 }}
      />
      <button
        onClick={reset}
        disabled={saving || pwd.length < 6}
        style={S.btn("#ef4444")}
      >
        <Ic.key />
        {saving ? "Réinitialisation..." : "Réinitialiser"}
      </button>
      <Msg msg={msg} />
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// Modal : Créer un utilisateur
// ════════════════════════════════════════════════════════════════
function ModalCreateUser({ token, onClose, onCreated }) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    fullName: "",
    email: "",
    phone: "",
    role: "user",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const create = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`${API}/admin/users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMsg({ type: "success", text: "Utilisateur créé !" });
      onCreated(d);
      setForm({
        username: "",
        password: "",
        fullName: "",
        email: "",
        phone: "",
        role: "user",
      });
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
    setSaving(false);
  };

  return (
    <Modal title="Nouvel utilisateur" onClose={onClose}>
      <div style={S.row}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Nom d'utilisateur *</label>
          <input
            value={form.username}
            onChange={set("username")}
            style={S.input}
            placeholder="ex: jean_dupont"
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Mot de passe *</label>
          <input
            type="password"
            value={form.password}
            onChange={set("password")}
            style={S.input}
            placeholder="Min. 6 caract."
          />
        </div>
      </div>
      <div style={S.row}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Nom complet</label>
          <input
            value={form.fullName}
            onChange={set("fullName")}
            style={S.input}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={set("email")}
            style={S.input}
          />
        </div>
      </div>
      <div style={S.row}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Téléphone</label>
          <input value={form.phone} onChange={set("phone")} style={S.input} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Rôle</label>
          <select value={form.role} onChange={set("role")} style={S.input}>
            <option value="user">Utilisateur</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <button
        onClick={create}
        disabled={saving || !form.username || form.password.length < 6}
        style={S.btn()}
      >
        <Ic.plus />
        {saving ? "Création..." : "Créer"}
      </button>
      <Msg msg={msg} />
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// Onglet : Utilisateurs
// ════════════════════════════════════════════════════════════════
function TabUsers({ token }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [editUser, setEditUser] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterRole) params.set("role", filterRole);
      const r = await fetch(`${API}/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) setUsers(await r.json());
    } catch {}
    setLoading(false);
  }, [token, search, filterRole]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (type, text) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 3500);
  };

  const toggleDisable = async (u) => {
    const r = await fetch(`${API}/admin/users/${u._id}/disable`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    if (r.ok) {
      setUsers((p) =>
        p.map((x) =>
          x._id === u._id ? { ...x, isDisabled: d.isDisabled } : x,
        ),
      );
      flash("success", `Compte ${d.isDisabled ? "désactivé" : "réactivé"}`);
    } else flash("error", d.error);
  };

  const toggleBan = async (u) => {
    const r = await fetch(`${API}/admin/users/${u._id}/ban`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    if (r.ok) {
      setUsers((p) =>
        p.map((x) => (x._id === u._id ? { ...x, isBanned: d.isBanned } : x)),
      );
      flash("success", `Utilisateur ${d.isBanned ? "banni" : "débanni"}`);
    } else flash("error", d.error);
  };

  const deleteUser = async (u) => {
    const r = await fetch(`${API}/admin/users/${u._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    if (r.ok) {
      setUsers((p) => p.filter((x) => x._id !== u._id));
      flash("success", "Utilisateur supprimé");
    } else flash("error", d.error);
    setConfirmDel(null);
  };

  return (
    <div>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <span
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#6b7280",
            }}
          >
            <Ic.search />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            style={{ ...S.input, paddingLeft: 32 }}
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          style={{ ...S.input, width: 140 }}
        >
          <option value="">Tous les rôles</option>
          <option value="user">Utilisateur</option>
          <option value="admin">Admin</option>
        </select>
        <button onClick={load} style={S.btn("#374151", true)}>
          <Ic.refresh />
        </button>
        <button onClick={() => setShowCreate(true)} style={S.btn()}>
          <Ic.plus /> Ajouter
        </button>
      </div>

      <Msg msg={actionMsg} />

      {/* Liste */}
      {loading ? (
        <p style={{ color: "#6b7280", textAlign: "center", padding: 30 }}>
          Chargement...
        </p>
      ) : users.length === 0 ? (
        <p style={{ color: "#4b5563", textAlign: "center", padding: 24 }}>
          Aucun utilisateur
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {users.map((u) => (
            <div
              key={u._id}
              style={{
                background: "#1a1f2e",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12,
                padding: "12px 14px",
                opacity: u.isDisabled || u.isBanned ? 0.6 : 1,
              }}
            >
              {/* Ligne 1 : avatar + infos + badges */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    ...S.avatar(u.avatar),
                    position: "relative",
                    flexShrink: 0,
                  }}
                >
                  {u.profilePicture ? (
                    <img
                      src={u.profilePicture}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    u.username[0].toUpperCase()
                  )}
                  <span
                    style={{
                      position: "absolute",
                      bottom: 0,
                      right: 0,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: STATUS_COLORS[u.status] || "#6b7280",
                      border: "1.5px solid #1a1f2e",
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: "#f1f5f9",
                      fontSize: "0.87rem",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    {u.username}
                    <span
                      style={S.badge(
                        u.role === "admin" ? "#8b5cf6" : "#6366f1",
                      )}
                    >
                      {u.role === "admin" ? "Admin" : "User"}
                    </span>
                    {u.isBanned && (
                      <span style={S.badge("#ef4444")}>Banni</span>
                    )}
                    {u.isDisabled && (
                      <span style={S.badge("#f97316")}>Désactivé</span>
                    )}
                  </div>
                  <div
                    style={{
                      color: "#6b7280",
                      fontSize: "0.75rem",
                      marginTop: 2,
                    }}
                  >
                    {u.email || u.fullName || formatDate(u.createdAt)}
                  </div>
                </div>
              </div>
              {/* Ligne 2 : actions */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  title="Modifier"
                  onClick={() => setEditUser(u)}
                  style={{ ...S.btn("#374151", true), padding: "5px 10px" }}
                >
                  <Ic.edit />{" "}
                  <span style={{ fontSize: "0.75rem" }}>Modifier</span>
                </button>
                <button
                  title="Reset MDP"
                  onClick={() => setResetUser(u)}
                  style={{ ...S.btn("#374151", true), padding: "5px 10px" }}
                >
                  <Ic.key />
                </button>
                <button
                  title={u.isDisabled ? "Réactiver" : "Désactiver"}
                  onClick={() => toggleDisable(u)}
                  style={{
                    ...S.btn(u.isDisabled ? "#10b981" : "#f97316", true),
                    padding: "5px 10px",
                  }}
                >
                  <Ic.disable />
                </button>
                <button
                  title={u.isBanned ? "Débannir" : "Bannir"}
                  onClick={() => toggleBan(u)}
                  style={{
                    ...S.btn(u.isBanned ? "#10b981" : "#ef4444", true),
                    padding: "5px 10px",
                  }}
                >
                  <Ic.ban />
                </button>
                <button
                  title="Supprimer"
                  onClick={() => setConfirmDel(u)}
                  style={{ ...S.btn("#7f1d1d", true), padding: "5px 10px" }}
                >
                  <Ic.trash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <ModalCreateUser
          token={token}
          onClose={() => setShowCreate(false)}
          onCreated={(u) => {
            setUsers((p) => [u, ...p]);
            setShowCreate(false);
          }}
        />
      )}
      {editUser && (
        <ModalEditUser
          token={token}
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={(u) => {
            setUsers((p) => p.map((x) => (x._id === u._id ? u : x)));
            setEditUser(null);
            flash("success", "Profil mis à jour");
          }}
        />
      )}
      {resetUser && (
        <ModalResetPwd
          token={token}
          user={resetUser}
          onClose={() => setResetUser(null)}
        />
      )}
      {confirmDel && (
        <Modal
          title="Confirmer la suppression"
          onClose={() => setConfirmDel(null)}
          width={380}
        >
          <p style={{ color: "#d1d5db", marginBottom: 16 }}>
            Supprimer définitivement{" "}
            <strong style={{ color: "#f1f5f9" }}>{confirmDel.username}</strong>{" "}
            ? Cette action est irréversible.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => deleteUser(confirmDel)}
              style={S.btn("#ef4444")}
            >
              <Ic.trash /> Supprimer
            </button>
            <button
              onClick={() => setConfirmDel(null)}
              style={S.btn("#374151")}
            >
              Annuler
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Modal : Éditer un salon
// ════════════════════════════════════════════════════════════════
function ModalEditRoom({ room, token, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: room.name || "",
    description: room.description || "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`${API}/admin/rooms/${room._id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMsg({ type: "success", text: "Salon mis à jour" });
      onSaved(d);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
    setSaving(false);
  };

  return (
    <Modal title={`Modifier — ${room.name}`} onClose={onClose} width={420}>
      <div style={{ marginBottom: 12 }}>
        <label style={S.label}>Nom du salon</label>
        <input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          style={S.input}
        />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={S.label}>Description</label>
        <input
          value={form.description}
          onChange={(e) =>
            setForm((p) => ({ ...p, description: e.target.value }))
          }
          style={S.input}
        />
      </div>
      <button onClick={save} disabled={saving} style={S.btn()}>
        {saving ? "Sauvegarde..." : "Enregistrer"}
      </button>
      <Msg msg={msg} />
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// Modal : Messages d'un salon
// ════════════════════════════════════════════════════════════════
function ModalRoomMessages({ room, token, onClose }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [delMsg, setDelMsg] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await fetch(`${API}/admin/rooms/${room._id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) setMessages(await r.json());
      setLoading(false);
    })();
  }, [room._id, token]);

  const deleteMsg = async (m) => {
    const r = await fetch(`${API}/admin/messages/${m._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) setMessages((p) => p.filter((x) => x._id !== m._id));
    setDelMsg(null);
  };

  return (
    <Modal title={`Messages — #${room.name}`} onClose={onClose} width={640}>
      {loading ? (
        <p style={{ color: "#6b7280", textAlign: "center" }}>Chargement...</p>
      ) : (
        <div
          style={{
            maxHeight: 400,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {messages.length === 0 && (
            <p style={{ color: "#4b5563", textAlign: "center" }}>
              Aucun message
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m._id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "8px 10px",
                background: "#1e2538",
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  ...S.avatar(m.author?.avatar),
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  fontSize: "0.75rem",
                }}
              >
                {m.author?.username?.[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      color: "#a5b4fc",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                    }}
                  >
                    {m.author?.username}
                  </span>
                  <span style={{ color: "#4b5563", fontSize: "0.72rem" }}>
                    {formatDate(m.createdAt)} {formatTime(m.createdAt)}
                  </span>
                </div>
                <p
                  style={{
                    color: "#d1d5db",
                    fontSize: "0.85rem",
                    margin: "2px 0 0",
                    wordBreak: "break-word",
                  }}
                >
                  {m.type === "image"
                    ? "[Image]"
                    : m.type === "audio"
                      ? "[Audio]"
                      : m.type === "giphy"
                        ? "[GIF]"
                        : m.content}
                </p>
              </div>
              <button
                onClick={() => setDelMsg(m)}
                style={{
                  ...S.btn("#7f1d1d", true),
                  padding: "4px 7px",
                  flexShrink: 0,
                }}
              >
                <Ic.trash />
              </button>
            </div>
          ))}
        </div>
      )}
      {delMsg && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 14px",
            background: "rgba(239,68,68,0.1)",
            borderRadius: 8,
            border: "1px solid #ef444433",
          }}
        >
          <p
            style={{
              color: "#fca5a5",
              fontSize: "0.88rem",
              margin: "0 0 10px",
            }}
          >
            Supprimer ce message ?
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => deleteMsg(delMsg)}
              style={S.btn("#ef4444", true)}
            >
              <Ic.trash /> Supprimer
            </button>
            <button
              onClick={() => setDelMsg(null)}
              style={S.btn("#374151", true)}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// Onglet : Salons
// ════════════════════════════════════════════════════════════════
function TabRooms({ token }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editRoom, setEditRoom] = useState(null);
  const [msgsRoom, setMsgsRoom] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`${API}/admin/rooms`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) setRooms(await r.json());
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (type, text) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 3500);
  };

  const deleteRoom = async (room) => {
    const r = await fetch(`${API}/admin/rooms/${room._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    if (r.ok) {
      setRooms((p) => p.filter((x) => x._id !== room._id));
      flash("success", "Salon supprimé");
    } else flash("error", d.error);
    setConfirmDel(null);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h2
          style={{
            color: "#f1f5f9",
            fontWeight: 700,
            fontSize: "1.1rem",
            margin: 0,
          }}
        >
          Salons ({rooms.length})
        </h2>
        <button onClick={load} style={S.btn("#374151", true)}>
          <Ic.refresh /> Rafraîchir
        </button>
      </div>
      <Msg msg={actionMsg} />
      {loading ? (
        <p style={{ color: "#6b7280", textAlign: "center", padding: 30 }}>
          Chargement...
        </p>
      ) : rooms.length === 0 ? (
        <p style={{ color: "#4b5563", textAlign: "center", padding: 24 }}>
          Aucun salon
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rooms.map((room) => (
            <div
              key={room._id}
              style={{
                background: "#1a1f2e",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              {/* Ligne 1 : nom + badges */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    color: "#a5b4fc",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                  }}
                >
                  {room.name}
                </span>
                <span
                  style={S.badge(
                    room.type === "private" ? "#f59e0b" : "#10b981",
                  )}
                >
                  {room.type}
                </span>
                <span
                  style={{
                    color: "#6b7280",
                    fontSize: "0.75rem",
                    marginLeft: "auto",
                  }}
                >
                  {room.members?.length ?? 0} membres
                </span>
              </div>
              {/* Ligne 2 : description + créateur */}
              <div
                style={{
                  color: "#6b7280",
                  fontSize: "0.78rem",
                  marginBottom: 8,
                }}
              >
                {room.description || <em>Pas de description</em>}
                {room.createdBy?.username && (
                  <span style={{ marginLeft: 8, color: "#4b5563" }}>
                    · par {room.createdBy.username}
                  </span>
                )}
                <span style={{ marginLeft: 8, color: "#374151" }}>
                  · {formatDate(room.createdAt)}
                </span>
              </div>
              {/* Actions */}
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  title="Modifier"
                  onClick={() => setEditRoom(room)}
                  style={{ ...S.btn("#374151", true), padding: "5px 10px" }}
                >
                  <Ic.edit />{" "}
                  <span style={{ fontSize: "0.75rem" }}>Modifier</span>
                </button>
                <button
                  title="Messages"
                  onClick={() => setMsgsRoom(room)}
                  style={{ ...S.btn("#374151", true), padding: "5px 10px" }}
                >
                  <Ic.msg />{" "}
                  <span style={{ fontSize: "0.75rem" }}>Messages</span>
                </button>
                <button
                  title="Supprimer"
                  onClick={() => setConfirmDel(room)}
                  style={{ ...S.btn("#7f1d1d", true), padding: "5px 10px" }}
                >
                  <Ic.trash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editRoom && (
        <ModalEditRoom
          token={token}
          room={editRoom}
          onClose={() => setEditRoom(null)}
          onSaved={(r) => {
            setRooms((p) => p.map((x) => (x._id === r._id ? r : x)));
            setEditRoom(null);
            flash("success", "Salon mis à jour");
          }}
        />
      )}
      {msgsRoom && (
        <ModalRoomMessages
          token={token}
          room={msgsRoom}
          onClose={() => setMsgsRoom(null)}
        />
      )}
      {confirmDel && (
        <Modal
          title="Supprimer le salon"
          onClose={() => setConfirmDel(null)}
          width={380}
        >
          <p style={{ color: "#d1d5db", marginBottom: 16 }}>
            Supprimer{" "}
            <strong style={{ color: "#a5b4fc" }}>#{confirmDel.name}</strong> et
            tous ses messages ? Action irréversible.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => deleteRoom(confirmDel)}
              style={S.btn("#ef4444")}
            >
              <Ic.trash /> Supprimer
            </button>
            <button
              onClick={() => setConfirmDel(null)}
              style={S.btn("#374151")}
            >
              Annuler
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ════════════════════════════════════════════════════════════════
const TABS = [
  { id: "stats", label: "Statistiques", icon: <Ic.stats /> },
  { id: "users", label: "Utilisateurs", icon: <Ic.users /> },
  { id: "rooms", label: "Salons", icon: <Ic.rooms /> },
];

export default function AdminPage({ onClose }) {
  const { token } = useAuth();
  const [tab, setTab] = useState("stats");
  const [mobile, setMobile] = useState(isMobile());

  useEffect(() => {
    const handler = () => setMobile(isMobile());
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return (
    <div
      style={S.overlay}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={S.panel}>
        {/* Drag handle */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "10px 0 6px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: "rgba(255,255,255,0.2)",
            }}
          />
        </div>

        {/* Header */}
        <div style={S.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: "rgba(99,102,241,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Ic.stats />
            </div>
            <div>
              <h1
                style={{
                  color: "#f1f5f9",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  margin: 0,
                }}
              >
                Tableau de bord Admin
              </h1>
              {!mobile && (
                <p style={{ color: "#6b7280", fontSize: "0.72rem", margin: 0 }}>
                  Gestion complète de l'application
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "none",
              color: "#9ca3af",
              width: 30,
              height: 30,
              borderRadius: 8,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ic.close />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            display: "flex",
            flex: 1,
            overflow: "hidden",
            flexDirection: mobile ? "column" : "row",
          }}
        >
          {/* Sidebar — desktop uniquement */}
          {!mobile && (
            <div style={S.sidebar}>
              <div style={{ padding: 10 }}>
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    style={S.navBtn(tab === t.id)}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Content */}
          <div style={S.content}>
            {tab === "stats" && <TabStats token={token} />}
            {tab === "users" && <TabUsers token={token} />}
            {tab === "rooms" && <TabRooms token={token} />}
          </div>

          {/* Nav bottom — mobile uniquement */}
          {mobile && (
            <div
              style={{
                display: "flex",
                background: "#1a1f2e",
                borderTop: "1px solid rgba(255,255,255,0.07)",
                flexShrink: 0,
              }}
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={S.mobileNavBtn(tab === t.id)}
                >
                  <span style={{ opacity: tab === t.id ? 1 : 0.6 }}>
                    {t.icon}
                  </span>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
