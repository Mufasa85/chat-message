import { useState, useEffect, useRef, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export default function GiphyPicker({ token, onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const debounce = useRef(null);
  const LIMIT = 24;

  const fetchGifs = useCallback(
    async (q, off = 0, append = false) => {
      setLoading(true);
      try {
        const p = new URLSearchParams({ limit: LIMIT, offset: off });
        if (q) p.set("q", q);
        const res = await fetch(`${API}/upload/giphy?${p}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setGifs((prev) => (append ? [...prev, ...data.gifs] : data.gifs));
        setHasMore(data.gifs.length === LIMIT);
      } catch (e) {
        console.error("[Giphy]", e);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    fetchGifs("", 0);
  }, [fetchGifs]);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setOffset(0);
      fetchGifs(query, 0);
    }, 400);
    return () => clearTimeout(debounce.current);
  }, [query, fetchGifs]);

  const s = {
    overlay: {
      position: "fixed",
      inset: 0,
      zIndex: 200,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "flex-start",
      padding: "0 0 80px 260px",
    },
    picker: {
      background: "#1a1a2e",
      borderRadius: 16,
      width: 380,
      maxHeight: 480,
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
      border: "1px solid #2d2d4e",
      overflow: "hidden",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 16px",
      borderBottom: "1px solid #2d2d4e",
    },
    search: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 14px",
      borderBottom: "1px solid #2d2d4e",
      background: "#0f0f1a",
    },
    input: {
      flex: 1,
      background: "none",
      border: "none",
      outline: "none",
      color: "#fff",
      fontSize: "0.9rem",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 4,
      padding: 8,
      overflowY: "auto",
      flex: 1,
    },
    item: {
      borderRadius: 8,
      overflow: "hidden",
      cursor: "pointer",
      aspectRatio: "1",
      background: "#2d2d4e",
    },
    img: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
    },
    skeleton: { borderRadius: 8, background: "#2d2d4e", aspectRatio: "1" },
    more: {
      margin: "8px auto",
      display: "block",
      background: "#2d2d4e",
      border: "none",
      color: "#9ca3af",
      padding: "6px 20px",
      borderRadius: 20,
      cursor: "pointer",
      fontSize: "0.85rem",
    },
    powered: {
      display: "flex",
      justifyContent: "center",
      padding: 8,
      borderTop: "1px solid #2d2d4e",
    },
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.picker} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={{ color: "#fff", fontWeight: 700 }}>
            {" "}
            Stickers & GIFs
          </span>
          <button
            style={{
              background: "none",
              border: "none",
              color: "#9ca3af",
              cursor: "pointer",
              fontSize: "1rem",
            }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div style={s.search}>
          <span>🔍</span>
          <input
            style={s.input}
            placeholder="Rechercher un GIF..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button
              style={{
                background: "none",
                border: "none",
                color: "#6b7280",
                cursor: "pointer",
              }}
              onClick={() => setQuery("")}
            >
              ✕
            </button>
          )}
        </div>
        <div style={s.grid}>
          {gifs.map((gif) => (
            <div
              key={gif.id}
              style={s.item}
              onClick={() => {
                onSelect(gif);
                onClose();
              }}
            >
              <img
                src={gif.preview}
                alt={gif.title}
                style={s.img}
                loading="lazy"
              />
            </div>
          ))}
          {loading &&
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={s.skeleton} />
            ))}
        </div>
        {hasMore && !loading && gifs.length > 0 && (
          <button
            style={s.more}
            onClick={() => {
              const n = offset + LIMIT;
              setOffset(n);
              fetchGifs(query, n, true);
            }}
          >
            Charger plus
          </button>
        )}
        {!loading && gifs.length === 0 && (
          <p style={{ textAlign: "center", color: "#6b7280", padding: "2rem" }}>
            Aucun résultat
          </p>
        )}
        <div style={s.powered}>
          <img
            src="https://media.giphy.com/headers/2022-07-12-18-56-25/Poweredby_100px-Black_VertText.png"
            alt="Powered by GIPHY"
            style={{ height: 24, opacity: 0.6 }}
          />
        </div>
      </div>
    </div>
  );
}
