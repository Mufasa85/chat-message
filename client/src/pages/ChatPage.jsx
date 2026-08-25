import { useEffect, useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { useFileUpload } from "../hooks/useFileUpload.jsx";
import GiphyPicker from "../../components/GiphyPicker";
import MessageBubble from "../../components/MessageBubble";
import CallModal from "../../components/CallModal";
import CallButton from "../../components/CallButton";
import VoiceRecorder from "../components/VoiceRecorder";
import ProfilePage from "./ProfilePage";
import AdminPage from "./AdminPage";
import DMPage from "./DMPage";

// Construire les options de durée depuis l'environnement
const durations = import.meta.env.VITE_EPHEMERAL_DURATIONS?.split(",").map(
  Number,
) || [10, 30, 60, 120, 300];
const labels = import.meta.env.VITE_EPHEMERAL_LABELS?.split(",") || [
  "10 sec",
  "30 sec",
  "1 min",
  "2 min",
  "5 min",
];
const ttlOptions = durations.map((value, i) => ({
  value,
  label: labels[i] || `${value}s`,
}));

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

function MessageInput({ token, replyTo, onCancelReply }) {
  const { sendMessage, sendTyping, sendGiphy, currentRoom, addMessage } =
    useChat();
  const [text, setText] = useState("");
  const [selectedTtl, setSelectedTtl] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showGiphy, setShowGiphy] = useState(false);
  const timer = useRef(null);
  const menuRef = useRef(null);
  const { uploading, progress, FileInput } = useFileUpload({
    token,
    onUploaded: () => {},
    onMessageUploaded: (msg) => {
      if (currentRoom?._id === msg.room) {
        addMessage(msg);
      }
    },
  });

  const handleChange = (e) => {
    setText(e.target.value);
    sendTyping(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => sendTyping(false), 1500);
  };

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage(
      text,
      selectedTtl !== null,
      selectedTtl || 300,
      replyTo || null,
    );
    setText("");
    setSelectedTtl(null);
    onCancelReply?.();
    clearTimeout(timer.current);
    sendTyping(false);
  };

  const handleSelectTtl = (value) => {
    setSelectedTtl(value);
    setShowMenu(false);
  };

  const clearTtl = () => {
    setSelectedTtl(null);
  };

  const handleGiphySelect = (gif) => {
    sendGiphy(gif);
    setShowGiphy(false);
  };

  return (
    <div className="p-2 sm:p-4 relative">
      {replyTo && (
        <div className="flex items-center gap-2 mb-1.5 px-2 py-1.5 bg-slate-700/40 rounded-lg border-l-2 border-indigo-400">
          <div className="flex-1 min-w-0">
            <p className="text-indigo-300 text-[10px] font-semibold truncate">
              {replyTo.author?.username}
            </p>
            <p className="text-gray-400 text-xs truncate">
              {replyTo.type === "audio"
                ? "🎤 Message vocal"
                : replyTo.type === "image"
                  ? "🖼 Image"
                  : replyTo.content}
            </p>
          </div>
          <button
            onClick={onCancelReply}
            className="text-gray-500 hover:text-white p-0.5 flex-shrink-0"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
      {uploading && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-slate-700/50">
          <div
            className="h-full bg-indigo-500 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="flex items-end gap-1.5 sm:gap-3 bg-slate-800/50 rounded-xl sm:rounded-2xl border border-slate-700/50 px-2 py-2 sm:px-4 sm:py-3">
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            disabled={!currentRoom || uploading}
            className={`p-1.5 sm:p-2 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              selectedTtl !== null
                ? "bg-indigo-600 text-white"
                : "text-gray-500 hover:text-gray-300 hover:bg-slate-700/50"
            }`}
            title="Choisir la durée du message"
          >
            <svg
              className="w-4 h-4 sm:w-5 sm:h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>

          {showMenu && (
            <div className="absolute bottom-full left-0 mb-2 bg-[#313338] rounded-lg shadow-xl border border-black/30 py-2 min-w-[120px]">
              <div className="px-3 py-1 text-gray-400 text-xs uppercase tracking-wider">
                Durée
              </div>
              {ttlOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSelectTtl(option.value)}
                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-[#404249] transition-colors ${
                    selectedTtl === option.value
                      ? "text-indigo-400"
                      : "text-gray-300"
                  }`}
                >
                  {option.label}
                </button>
              ))}
              {selectedTtl !== null && (
                <button
                  onClick={clearTtl}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-[#404249] transition-colors text-red-400 border-t border-gray-700 mt-1"
                >
                  Annuler
                </button>
              )}
            </div>
          )}
        </div>

        <FileInput
          roomId={currentRoom?._id}
          disabled={!currentRoom || uploading}
        />

        {/* <button
          onClick={() => setShowGiphy(!showGiphy)}
          disabled={!currentRoom || uploading}
          className="text-gray-500 hover:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed p-1.5 sm:p-2 rounded-lg hover:bg-slate-700/50 transition-all"
          title="Envoyer un GIF"
        >
          <span className="text-sm sm:text-lg"></span>
        </button> */}

        <textarea
          className="flex-1 bg-transparent text-white placeholder-slate-500 text-xs sm:text-sm resize-none outline-none max-h-24 sm:max-h-32"
          placeholder={
            currentRoom
              ? `Message dans ${currentRoom.name}`
              : "Rejoins un salon..."
          }
          value={text}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={!currentRoom || uploading}
          rows={1}
        />

        {currentRoom && (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <VoiceRecorder
              roomId={currentRoom._id}
              token={token}
              apiUrl={API}
              onSent={(msg) => addMessage(msg)}
            />
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={!currentRoom || !text.trim() || uploading}
          className="text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed p-1"
        >
          <svg
            className="w-4 h-4 sm:w-5 sm:h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9 2zm0 0v-8"
            />
          </svg>
        </button>
      </div>

      {showGiphy && (
        <div className="absolute bottom-full right-0 mb-2 z-50">
          <GiphyPicker
            token={token}
            onSelect={handleGiphySelect}
            onClose={() => setShowGiphy(false)}
          />
        </div>
      )}
    </div>
  );
}

// Composant pour afficher un salon avec son badge de notification
function RoomItem({
  room,
  isActive,
  onClick,
  unreadCount,
  isCreator,
  onEdit,
  onDelete,
}) {
  const hasUnread = unreadCount > 0;
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className={`flex items-center gap-1.5 px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-md cursor-pointer transition-colors group relative ${
        isActive
          ? "bg-[#404249] text-white"
          : hasUnread
            ? "text-white font-semibold bg-[#35363c]/70"
            : "text-gray-400 hover:bg-[#35373c] hover:text-white"
      }`}
    >
      {/* Indicateur visuel pour salon non lu */}
      {hasUnread && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-500 rounded-r-full"></div>
      )}

      <div
        onClick={onClick}
        className="flex items-center gap-1.5 flex-1 min-w-0"
      >
        {isActive ? (
          <svg
            className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        ) : (
          <svg
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${hasUnread ? "text-white" : "text-gray-400"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        )}
        <span
          className={`text-xs sm:text-sm truncate ${hasUnread ? "font-bold text-white" : "text-gray-300"}`}
        >
          {room.name}
        </span>

        {/* Badge de notification - toujours visible quand il y a des messages non lus */}
        {unreadCount > 0 && (
          <span
            className={`
            flex items-center justify-center min-w-[16px] h-4 sm:min-w-[20px] sm:h-5 px-1 sm:px-1.5 rounded-full text-[10px] sm:text-[11px] font-bold shadow-md animate-pulse
            ${
              unreadCount >= 10
                ? "bg-red-500 text-white"
                : unreadCount >= 5
                  ? "bg-orange-500 text-white"
                  : "bg-indigo-500 text-white"
            }
          `}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>

      {/* Boutons admin pour le créateur */}
      {isCreator && (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-black/20 transition-opacity"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </button>
          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              ></div>
              <div className="absolute right-0 top-full mt-1 bg-[#313338] rounded-lg shadow-xl border border-black/30 py-1 min-w-[140px] z-20">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onEdit();
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#404249]"
                >
                  Modifier
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onDelete();
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-[#404249]"
                >
                  Supprimer
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const { user, token, logout } = useAuth();
  const {
    messages,
    currentRoom,
    onlineUsers,
    typingUsers,
    rooms,
    joinRoom,
    fetchRooms,
    createRoom,
    updateRoom,
    deleteRoom,
    webrtc,
    unreadCounts,
    getTotalUnread,
    toasts,
    dismissToast,
    dmUnread,
    clearDmUnread,
  } = useChat();
  const [showCreate, setShowCreate] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDesc, setNewRoomDesc] = useState("");
  const [showUserPanel, setShowUserPanel] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileUsersOpen, setMobileUsersOpen] = useState(false);
  // Modal modification salon
  const [showEditRoom, setShowEditRoom] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [editRoomName, setEditRoomName] = useState("");
  const [editRoomDesc, setEditRoomDesc] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showDM, setShowDM] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleCreate = async () => {
    if (!newRoomName.trim()) return;
    try {
      const room = await createRoom(newRoomName.trim(), newRoomDesc.trim());
      setShowCreate(false);
      setNewRoomName("");
      setNewRoomDesc("");
      joinRoom(room);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEditRoom = (room) => {
    setEditingRoom(room);
    setEditRoomName(room.name);
    setEditRoomDesc(room.description || "");
    setShowEditRoom(true);
  };

  const handleSaveEdit = async () => {
    if (!editRoomName.trim() || !editingRoom) return;
    try {
      await updateRoom(editingRoom._id, {
        name: editRoomName.trim(),
        description: editRoomDesc.trim(),
      });
      setShowEditRoom(false);
      setEditingRoom(null);
      setEditRoomName("");
      setEditRoomDesc("");
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteRoom = async (room) => {
    if (
      window.confirm(`Supprimer le salon "${room.name}" et tous ses messages ?`)
    ) {
      try {
        await deleteRoom(room._id);
      } catch (err) {
        alert(err.message);
      }
    }
  };

  const totalUnread = getTotalUnread();

  return (
    <div className="flex h-dvh bg-[#1a1a1a]">
      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div
            className="flex-1 bg-black/60"
            onClick={() => setMobileSidebarOpen(false)}
          ></div>
          <div className="w-64 bg-[#1e1f22] flex flex-col h-full">
            <div className="p-4 border-b border-black/30 flex items-center justify-between">
              <h2 className="text-white font-semibold">Serveur</h2>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-2 flex-1 overflow-y-auto">
              {/* Mon espace — mobile */}
              <div className="mb-4">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-1">
                  Mon espace
                </span>
                <div className="mt-1.5 space-y-0.5">
                  <button
                    onClick={() => {
                      setShowProfile(true);
                      setMobileSidebarOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-gray-400 hover:bg-[#35373c] hover:text-white transition-colors text-sm"
                  >
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>Mon profil</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowDM(true);
                      clearDmUnread();
                      setMobileSidebarOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-gray-400 hover:bg-[#35373c] hover:text-white transition-colors text-sm"
                  >
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="flex-1 text-left">Messages privés</span>
                    {dmUnread > 0 && (
                      <span className="bg-indigo-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                        {dmUnread}
                      </span>
                    )}
                  </button>
                  {user?.role === "admin" && (
                    <button
                      onClick={() => {
                        setShowAdmin(true);
                        setMobileSidebarOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors text-sm"
                    >
                      <svg
                        className="w-4 h-4 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                      </svg>
                      <span>Administration</span>
                    </button>
                  )}
                </div>
                <div className="mt-3 h-px bg-white/5 mx-1" />
              </div>

              <div className="flex items-center justify-between px-1 mb-1.5">
                <span className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Salons texte
                </span>
                <button
                  onClick={() => {
                    setShowCreate(true);
                    setMobileSidebarOpen(false);
                  }}
                  className="text-gray-500 hover:text-white transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </button>
              </div>
              <div className="space-y-px">
                {rooms.map((room) => (
                  <RoomItem
                    key={room._id}
                    room={room}
                    isActive={currentRoom?._id === room._id}
                    onClick={() => {
                      joinRoom(room);
                      setMobileSidebarOpen(false);
                    }}
                    unreadCount={unreadCounts[room._id] || 0}
                    isCreator={
                      String(room.createdBy?._id || room.createdBy) ===
                      String(user?._id)
                    }
                    onEdit={() => handleEditRoom(room)}
                    onDelete={() => handleDeleteRoom(room)}
                  />
                ))}
                {rooms.length === 0 && (
                  <p className="text-gray-500 text-xs px-2 py-4 text-center">
                    Aucun salon
                  </p>
                )}
              </div>
            </div>
            <div className="bg-[#232428] p-2">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#35363c]">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                  style={{ background: user?.avatar || "#6366f1" }}
                >
                  {user?.username?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {user?.username}
                  </p>
                  <p className="text-gray-400 text-xs">En ligne</p>
                </div>
                <button
                  onClick={logout}
                  className="text-gray-400 hover:text-white p-1"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Servers Sidebar (hidden on mobile) */}
      <div className="hidden md:flex w-16 bg-[#1a1a1a] flex flex-col items-center py-3 gap-2 border-r border-black/30">
        {/* Bouton salon principal avec badge total */}
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="relative w-12 h-12 rounded-2xl bg-[#313338] hover:rounded-xl transition-all hover:bg-indigo-600 flex items-center justify-center group"
        >
          <svg
            className="w-6 h-6 text-indigo-400 group-hover:text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          {/* Badge total des notifications */}
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </button>
        <div className="w-8 h-0.5 bg-[#313338] rounded-full my-1"></div>
        <button
          onClick={() => {
            setShowCreate(true);
          }}
          className="w-12 h-12 rounded-2xl bg-[#313338] hover:rounded-xl transition-all hover:bg-green-600 flex items-center justify-center"
        >
          <svg
            className="w-6 h-6 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>

      {/* Desktop Channels Sidebar */}
      <div className="hidden md:flex w-60 bg-[#1e1f22] flex-col">
        <div className="p-4 border-b border-black/30">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">Serveur Discord-like</h2>
            <button className="text-gray-400 hover:text-white">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 sm:p-3">
          {/* Mon espace */}
          <div className="mb-4">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-1">
              Mon espace
            </span>
            <div className="mt-1.5 space-y-0.5">
              <button
                onClick={() => setShowProfile(true)}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-gray-400 hover:bg-[#35373c] hover:text-white transition-colors text-sm"
              >
                <svg
                  className="w-4 h-4 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>Mon profil</span>
              </button>
              <button
                onClick={() => {
                  setShowDM(true);
                  clearDmUnread();
                }}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-gray-400 hover:bg-[#35373c] hover:text-white transition-colors text-sm"
              >
                <svg
                  className="w-4 h-4 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span className="flex-1 text-left">Messages privés</span>
                {dmUnread > 0 && (
                  <span className="bg-indigo-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                    {dmUnread}
                  </span>
                )}
              </button>
              {user?.role === "admin" && (
                <button
                  onClick={() => setShowAdmin(true)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors text-sm"
                >
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                  <span>Administration</span>
                </button>
              )}
            </div>
            <div className="mt-3 h-px bg-white/5 mx-1" />
          </div>

          <div className="mb-3 sm:mb-4">
            <div className="flex items-center justify-between px-1 mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Salons texte
              </span>
              <button
                onClick={() => setShowCreate(true)}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-px sm:space-y-0.5">
              {rooms.map((room) => (
                <RoomItem
                  key={room._id}
                  room={room}
                  isActive={currentRoom?._id === room._id}
                  onClick={() => joinRoom(room)}
                  unreadCount={unreadCounts[room._id] || 0}
                  isCreator={
                    String(room.createdBy?._id || room.createdBy) ===
                    String(user?._id)
                  }
                  onEdit={() => handleEditRoom(room)}
                  onDelete={() => handleDeleteRoom(room)}
                />
              ))}

              {rooms.length === 0 && (
                <p className="text-gray-500 text-xs px-2 py-4 text-center">
                  Aucun salon
                </p>
              )}
            </div>
          </div>
        </div>

        {/* User Info Footer */}
        <div className="bg-[#232428] p-1.5">
          <div className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-[#35363c]">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
              style={{ background: user?.avatar || "#6366f1" }}
            >
              {user?.username?.[0]?.toUpperCase()}
            </div>
            {user?.role === "admin" && (
              <button
                onClick={() => setShowAdmin(true)}
                title="Administration"
                className="text-indigo-400 hover:text-indigo-300 p-0.5 flex-shrink-0"
              >
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
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setShowProfile(true)}
              className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
            >
              <p className="text-white text-xs font-medium truncate">
                {user?.username}
              </p>
              <p className="text-gray-400 text-[10px]">En ligne</p>
            </button>
            <button
              onClick={logout}
              className="text-gray-400 hover:text-white p-0.5"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[#2b2d31]">
        {/* Channel Header */}
        <div className="h-10 sm:h-14 px-2 sm:px-4 flex items-center gap-1.5 sm:gap-2 border-b border-black/30 shadow-sm bg-[#313338]">
          <button
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            className="md:hidden text-white hover:text-indigo-400 p-1.5 bg-[#2b2d31] rounded-lg mr-1"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <svg
            className="w-4 h-4 text-gray-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <span className="text-white font-bold text-sm sm:text-base truncate">
            {currentRoom ? ` ${currentRoom.name}` : "Bienvenue"}
          </span>
          {currentRoom && (
            <>
              <div className="w-px h-4 bg-gray-600 mx-2"></div>
              <span className="text-gray-400 text-sm hidden sm:inline">
                {currentRoom.description || "Aucun sujet"}
              </span>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {currentRoom && (
              <span className="text-xs text-gray-500 hidden sm:inline">
                {onlineUsers.length} en ligne
              </span>
            )}
            {/* Bouton mobile pour voir les utilisateurs en ligne */}
            {currentRoom && (
              <button
                onClick={() => setMobileUsersOpen(true)}
                className="md:hidden flex items-center gap-1 bg-[#313338] hover:bg-[#404249] text-gray-300 px-1.5 py-1 rounded-lg text-xs transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <span className="font-medium">{onlineUsers.length}</span>
              </button>
            )}
            <button
              onClick={() => setShowUserPanel(!showUserPanel)}
              className="text-gray-400 hover:text-white p-1 hidden md:block"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!currentRoom ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-full bg-[#313338] flex items-center justify-center mb-3 sm:mb-6">
                <svg
                  className="w-6 h-6 sm:w-10 sm:h-10 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h2 className="text-white text-base sm:text-2xl font-bold mb-1 sm:mb-2 text-center px-4">
                Bienvenue dans le serveur
              </h2>
              <p className="text-gray-400 text-xs sm:text-sm text-center max-w-[260px] sm:max-w-md px-4">
                Sélectionnez un salon pour commencer à discuter
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg._id}
                  msg={msg}
                  isOwn={
                    msg.author?._id === user?._id || msg.author === user?._id
                  }
                  onReply={(m) => setReplyTo(m)}
                />
              ))}
              {typingUsers.length > 0 && (
                <div className="flex items-center gap-2 text-gray-400 text-sm mt-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></span>
                    <span
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    ></span>
                    <span
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    ></span>
                  </div>
                  <span>
                    {typingUsers.map((u) => u.username).join(", ")}{" "}
                    {typingUsers.length === 1 ? "tape" : "tapent"}...
                  </span>
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        <MessageInput
          token={token}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />

        {/* Mobile Footer */}
        <div className="md:hidden h-10 px-4 flex items-center justify-between bg-[#232428] border-t border-black/30">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold"
              style={{ background: user?.avatar || "#6366f1" }}
            >
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <span className="text-white text-xs font-medium">
              {user?.username}
            </span>
          </div>
          <span className="text-green-500 text-xs">● En ligne</span>
        </div>
      </div>

      {/* Users Panel (hidden on mobile) */}
      {currentRoom && showUserPanel && (
        <div className="hidden lg:flex w-60 bg-[#1e1f22] border-l border-black/30">
          <div className="p-4">
            <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-4">
              En ligne — {onlineUsers.length}
            </h3>
            <div className="space-y-1">
              {onlineUsers.map((u) => {
                const isSelf = String(u._id) === String(user?._id);
                return (
                  <div
                    key={u._id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#35373c] cursor-pointer transition-colors"
                  >
                    <div className="relative">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                        style={{ background: u.avatar || "#6366f1" }}
                      >
                        {u.username?.[0]?.toUpperCase()}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#1e1f22]"></div>
                    </div>
                    <span className="text-gray-300 text-sm truncate">
                      {u.username}
                    </span>
                    {!isSelf && (
                      <div className="ml-auto">
                        <CallButton
                          user={{
                            userId: u._id,
                            username: u.username,
                            avatar: u.avatar,
                          }}
                          onCall={webrtc.startCall}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Create Channel Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-[#313338] rounded-lg w-[440px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-black/20">
              <h3 className="text-white text-lg font-semibold">
                Créer un salon
              </h3>
              <p className="text-gray-400 text-sm mt-1">
                Les salons textuels permettent d'envoyer des messages
              </p>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="text-gray-300 text-xs font-semibold uppercase tracking-wider block mb-2">
                  Nom du salon
                </label>
                <input
                  className="w-full px-3 py-2 bg-[#1e1f22] border border-black/30 rounded text-white text-sm placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
                  placeholder="nouveau-sal"
                  value={newRoomName}
                  onChange={(e) =>
                    setNewRoomName(
                      e.target.value.toLowerCase().replace(/\s+/g, "-"),
                    )
                  }
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  autoFocus
                />
              </div>

              <div>
                <label className="text-gray-300 text-xs font-semibold uppercase tracking-wider block mb-2">
                  Description du salon{" "}
                  <span className="text-gray-500 font-normal">(optionnel)</span>
                </label>
                <input
                  className="w-full px-3 py-2 bg-[#1e1f22] border border-black/30 rounded text-white text-sm placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
                  placeholder="Donnez aux membres une description de votre salon"
                  value={newRoomDesc}
                  onChange={(e) => setNewRoomDesc(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-black/20">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-md text-gray-300 hover:bg-[#404249] transition-colors text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!newRoomName.trim()}
              >
                Créer un salon
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Room Modal */}
      {showEditRoom && editingRoom && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowEditRoom(false)}
        >
          <div
            className="bg-[#313338] rounded-lg w-[440px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-black/20">
              <h3 className="text-white text-lg font-semibold">
                Modifier le salon
              </h3>
              <p className="text-gray-400 text-sm mt-1">
                Modifiez les informations du salon
              </p>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="text-gray-300 text-xs font-semibold uppercase tracking-wider block mb-2">
                  Nom du salon
                </label>
                <input
                  className="w-full px-3 py-2 bg-[#1e1f22] border border-black/30 rounded text-white text-sm placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
                  placeholder="nom-du-salon"
                  value={editRoomName}
                  onChange={(e) =>
                    setEditRoomName(
                      e.target.value.toLowerCase().replace(/\s+/g, "-"),
                    )
                  }
                  onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                  autoFocus
                />
              </div>

              <div>
                <label className="text-gray-300 text-xs font-semibold uppercase tracking-wider block mb-2">
                  Description du salon{" "}
                  <span className="text-gray-500 font-normal">(optionnel)</span>
                </label>
                <input
                  className="w-full px-3 py-2 bg-[#1e1f22] border border-black/30 rounded text-white text-sm placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
                  placeholder="Description du salon"
                  value={editRoomDesc}
                  onChange={(e) => setEditRoomDesc(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-black/20">
              <button
                onClick={() => setShowEditRoom(false)}
                className="px-4 py-2 rounded-md text-gray-300 hover:bg-[#404249] transition-colors text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!editRoomName.trim()}
              >
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Users Panel Overlay */}
      {mobileUsersOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/60"
            onClick={() => setMobileUsersOpen(false)}
          ></div>
          <div className="w-72 bg-[#1e1f22] flex flex-col h-full max-w-[85vw]">
            <div className="p-4 border-b border-black/30 flex items-center justify-between">
              <h2 className="text-white font-semibold">Membres en ligne</h2>
              <button
                onClick={() => setMobileUsersOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
                En ligne — {onlineUsers.length}
              </h3>
              <div className="space-y-1">
                {onlineUsers.map((u) => {
                  const isSelf = String(u._id) === String(user?._id);
                  return (
                    <div
                      key={u._id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#35373c] transition-colors"
                    >
                      <div className="relative flex-shrink-0">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                          style={{ background: u.avatar || "#6366f1" }}
                        >
                          {u.username?.[0]?.toUpperCase()}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-[#1e1f22]"></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {u.username}
                          {isSelf && (
                            <span className="text-gray-500 font-normal ml-1">
                              (vous)
                            </span>
                          )}
                        </p>
                        <p className="text-green-500 text-xs">En ligne</p>
                      </div>
                      {!isSelf && (
                        <CallButton
                          user={{
                            userId: u._id,
                            username: u.username,
                            avatar: u.avatar,
                          }}
                          onCall={webrtc.startCall}
                        />
                      )}
                    </div>
                  );
                })}
                {onlineUsers.length === 0 && (
                  <p className="text-gray-500 text-sm px-2 py-4 text-center">
                    Aucun utilisateur en ligne
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page Profil */}
      {showProfile && <ProfilePage onBack={() => setShowProfile(false)} />}

      {/* Administration */}
      {showAdmin && <AdminPage onClose={() => setShowAdmin(false)} />}

      {/* Messages privés */}
      {showDM && <DMPage onClose={() => setShowDM(false)} />}

      {/* Toasts de notification */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[400] flex flex-col gap-2 max-w-[320px] w-[calc(100vw-2rem)]">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="flex items-start gap-3 bg-[#1e1f22] border border-indigo-500/30 rounded-xl px-3 py-2.5 shadow-2xl cursor-pointer hover:bg-[#2a2b30] transition-colors animate-in slide-in-from-right-4"
              onClick={() => {
                if (t.isDM) {
                  setShowDM(true);
                  clearDmUnread();
                } else {
                  const room = rooms.find((r) => String(r._id) === t.roomId);
                  if (room) {
                    joinRoom(room);
                    setMobileSidebarOpen(false);
                  }
                }
                dismissToast(t.id);
              }}
            >
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {t.author?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-white text-xs font-semibold truncate">
                    {t.author}
                  </span>
                  {t.isDM ? (
                    <span className="text-violet-400 text-[10px]">
                      💬 Message privé
                    </span>
                  ) : (
                    <span className="text-indigo-400 text-[10px] truncate">
                      #{t.roomName}
                    </span>
                  )}
                </div>
                <p className="text-gray-300 text-xs truncate">{t.preview}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismissToast(t.id);
                }}
                className="text-gray-500 hover:text-white flex-shrink-0 p-0.5 mt-0.5"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* CallModal - WebRTC */}
      <CallModal
        callState={webrtc.callState}
        callType={webrtc.callType}
        remoteUser={webrtc.remoteUser}
        currentUser={user}
        isMuted={webrtc.isMuted}
        isCamOff={webrtc.isCamOff}
        localVideoRef={webrtc.localVideoRef}
        localStreamRef={webrtc.localStreamRef}
        remoteVideoRef={webrtc.remoteVideoRef}
        remoteAudioRef={webrtc.remoteAudioRef}
        remoteStream={webrtc.remoteStream}
        peerConnection={webrtc.peerConnectionRef?.current}
        onAccept={webrtc.acceptCall}
        onReject={webrtc.rejectCall}
        onHangUp={webrtc.hangUp}
        onToggleMute={webrtc.toggleMute}
        onToggleCamera={webrtc.toggleCamera}
      />
    </div>
  );
}
