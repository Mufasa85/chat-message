import { useState, useRef } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export const useFileUpload = ({ token, onUploaded, onMessageUploaded }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const openPicker = () => inputRef.current?.click();

  const upload = async (file, roomId) => {
    if (!file || !roomId) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("roomId", roomId);
      const msg = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status < 300
            ? resolve(JSON.parse(xhr.responseText))
            : reject(new Error(JSON.parse(xhr.responseText).error));
        xhr.onerror = () => reject(new Error("Erreur réseau"));
        xhr.open("POST", `${API}/upload`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.send(fd);
      });

      onUploaded?.(msg);
      onMessageUploaded?.(msg);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const FileInput = ({ roomId, disabled }) => (
    <button
      type="button"
      onClick={openPicker}
      disabled={disabled}
      className="text-gray-500 hover:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed p-2 rounded-lg hover:bg-slate-700/50 transition-all"
      title="Envoyer un fichier"
    >
      <span className="text-lg">📎</span>
      <input
        ref={inputRef}
        type="file"
        style={{ display: "none" }}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f, roomId);
        }}
      />
    </button>
  );

  return { uploading, progress, error, openPicker, upload, FileInput };
};

export const formatBytes = (b) => {
  if (!b) return "";
  if (b < 1024) return `${b} o`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} Ko`;
  return `${(b / 1024 ** 2).toFixed(1)} Mo`;
};
