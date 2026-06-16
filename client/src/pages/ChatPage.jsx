import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import './globals.css'

function MessageBubble({ msg, isOwn }) {
  return (
    <div className={`group flex gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'} hover:bg-slate-800/30 -mx-4 px-4 py-1 rounded-lg transition-colors`}>
      {!isOwn && (
        <div 
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 mt-0.5"
          style={{ background: msg.author?.avatar || '#6366f1' }}
        >
          {msg.author?.username?.[0]?.toUpperCase()}
        </div>
      )}
      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isOwn && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-medium text-sm">{msg.author?.username}</span>
            <span className="text-gray-500 text-xs">
              {new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
          isOwn 
            ? 'bg-indigo-600 text-white rounded-br-sm' 
            : 'bg-slate-700/80 text-gray-100 rounded-bl-sm'
        }`}>
          {msg.content}
        </div>
        {isOwn && (
          <span className="text-gray-500 text-xs mt-1 mr-1">
            {new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
}

function MessageInput() {
  const { sendMessage, sendTyping, currentRoom } = useChat();
  const [text, setText] = useState('');
  const timer = useRef(null);

  const handleChange = (e) => {
    setText(e.target.value);
    sendTyping(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => sendTyping(false), 1500);
  };

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage(text);
    setText('');
    clearTimeout(timer.current);
    sendTyping(false);
  };

  return (
    <div className="p-4">
      <div className="flex items-end gap-3 bg-slate-800/50 rounded-2xl border border-slate-700/50 px-4 py-3">
        <textarea
          className="flex-1 bg-transparent text-white placeholder-slate-500 text-sm resize-none outline-none max-h-32"
          placeholder={currentRoom ? `Envoyer un message dans #${currentRoom.name}` : 'Rejoins un salon pour discuter...'}
          value={text}
          onChange={handleChange}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          disabled={!currentRoom}
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={!currentRoom || !text.trim()}
          className="text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9 2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { user, logout } = useAuth();
  const { messages, currentRoom, onlineUsers, typingUsers, connected, rooms, joinRoom, fetchRooms, createRoom } = useChat();
  const [showCreate, setShowCreate] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [showUserPanel, setShowUserPanel] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleCreate = async () => {
    if (!newRoomName.trim()) return;
    try {
      const room = await createRoom(newRoomName.trim(), newRoomDesc.trim());
      setShowCreate(false);
      setNewRoomName('');
      setNewRoomDesc('');
      joinRoom(room);
    } catch (err) { alert(err.message); }
  };

  return (
    <div className="flex h-screen bg-[#1a1a1a]">
      {/* Servers Sidebar */}
      <div className="w-16 bg-[#1a1a1a] flex flex-col items-center py-3 gap-2 border-r border-black/30">
        <button className="w-12 h-12 rounded-2xl bg-[#313338] hover:rounded-xl transition-all hover:bg-indigo-600 flex items-center justify-center group">
          <svg className="w-6 h-6 text-indigo-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
        <div className="w-8 h-0.5 bg-[#313338] rounded-full my-1"></div>
        <button className="w-12 h-12 rounded-2xl bg-[#313338] hover:rounded-xl transition-all hover:bg-green-600 flex items-center justify-center">
          <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Channels Sidebar */}
      <div className="w-60 bg-[#1e1f22] flex flex-col">
        <div className="p-4 border-b border-black/30">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">Serveur Discord-like</h2>
            <button className="text-gray-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {/* TEXT CHANNELS section */}
          <div className="mb-4">
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Salons texte</span>
              <button onClick={() => setShowCreate(true)} className="text-gray-500 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-0.5">
              {rooms.map((room) => (
                <div
                  key={room._id}
                  onClick={() => joinRoom(room)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                    currentRoom?._id === room._id
                      ? 'bg-[#404249] text-white'
                      : 'text-gray-400 hover:bg-[#35373c] hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="text-sm truncate">{room.name}</span>
                </div>
              ))}
              
              {rooms.length === 0 && (
                <p className="text-gray-500 text-xs px-2 py-4 text-center">Aucun salon</p>
              )}
            </div>
          </div>
        </div>

        {/* User Info Footer */}
        <div className="bg-[#232428] p-2">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#35363c]">
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
              style={{ background: user?.avatar || '#6366f1' }}
            >
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.username}</p>
              <p className="text-gray-400 text-xs">En ligne</p>
            </div>
            <button onClick={logout} className="text-gray-400 hover:text-white p-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[#2b2d31]">
        {/* Channel Header */}
        <div className="h-12 px-4 flex items-center gap-3 border-b border-black/30 shadow-sm">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-white font-semibold">
            {currentRoom ? currentRoom.name : 'Bienvenue'}
          </span>
          {currentRoom && (
            <>
              <div className="w-px h-5 bg-gray-600"></div>
              <span className="text-gray-400 text-sm">{currentRoom.description || 'Aucun sujet'}</span>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button 
              onClick={() => setShowUserPanel(!showUserPanel)}
              className="text-gray-400 hover:text-white p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!currentRoom ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-20 h-20 rounded-full bg-[#313338] flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-white text-2xl font-bold mb-2">
                Bienvenue dans le serveur
              </h2>
              <p className="text-gray-400 text-center max-w-md">
                Sélectionnez un salon textuel dans la liste des canaux pour commencer à discuter
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg._id} msg={msg} isOwn={msg.author?._id === user?._id || msg.author === user?._id} />
              ))}
              {typingUsers.length > 0 && (
                <div className="flex items-center gap-2 text-gray-400 text-sm mt-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                  <span>{typingUsers.map((u) => u.username).join(', ')} {typingUsers.length === 1 ? 'tape' : 'tapent'}...</span>
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        <MessageInput />
      </div>

      {/* Users Panel */}
      {currentRoom && showUserPanel && (
        <div className="w-60 bg-[#1e1f22] border-l border-black/30">
          <div className="p-4">
            <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-4">
              En ligne — {onlineUsers.length}
            </h3>
            <div className="space-y-1">
              {onlineUsers.map((u) => (
                <div key={u._id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#35363c] cursor-pointer transition-colors">
                  <div className="relative">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                      style={{ background: u.avatar || '#6366f1' }}
                    >
                      {u.username?.[0]?.toUpperCase()}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#1e1f22]"></div>
                  </div>
                  <span className="text-gray-300 text-sm truncate">{u.username}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create Channel Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div 
            className="bg-[#313338] rounded-lg w-[440px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-black/20">
              <h3 className="text-white text-lg font-semibold">Créer un salon</h3>
              <p className="text-gray-400 text-sm mt-1">Les salons textuels permettent d'envoyer des messages</p>
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
                  onChange={(e) => setNewRoomName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
              </div>
              
              <div>
                <label className="text-gray-300 text-xs font-semibold uppercase tracking-wider block mb-2">
                  Description du salon <span className="text-gray-500 font-normal">(optionnel)</span>
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
    </div>
  );
}
