import { useState, useRef, useEffect } from 'react';
import { useChat } from '../src/context/ChatContext';
import { useAuth } from '../src/context/AuthContext';
import MessageReactions from '../src/components/MessageReactions';

const formatBytes = (b) => {
  if (!b) return '';
  if (b < 1024) return `${b} o`;
  if (b < 1024**2) return `${(b/1024).toFixed(1)} Ko`;
  return `${(b/1024**2).toFixed(1)} Mo`;
};
const fileIcon = (f) => ({ pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',zip:'📦',txt:'🗒️',mp3:'🎵',wav:'🎵',mp4:'🎬',mov:'🎬' }[f?.toLowerCase()] || '📎');

export default function MessageBubble({ msg, isOwn }) {
  const { currentRoom, updateMessage, deleteMessage, emit } = useChat();
  const { user: currentUser } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const [isDeleting, setIsDeleting] = useState(false);
  const menuRef = useRef(null);
  const editInputRef = useRef(null);

  // Fermer le menu si on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  // Focus sur l'input d'édition
  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  const handleEdit = () => {
    setShowMenu(false);
    setIsEditing(true);
    setEditContent(msg.content);
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim() || editContent === msg.content) {
      setIsEditing(false);
      return;
    }
    try {
      await updateMessage(currentRoom._id, msg._id, editContent.trim());
      setIsEditing(false);
    } catch (err) {
      alert('Erreur: ' + err.message);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(msg.content);
  };

  const handleDelete = async () => {
    setShowMenu(false);
    setIsDeleting(true);
    if (window.confirm('Supprimer ce message ?')) {
      try {
        await deleteMessage(currentRoom._id, msg._id);
      } catch (err) {
        alert('Erreur: ' + err.message);
      }
    }
    setIsDeleting(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const att = msg.attachment;
  const s = {
    row:    { display:'flex', alignItems:'flex-end', gap:8, position:'relative' },
    av:     { width:34, height:34, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:'0.9rem', flexShrink:0 },
    bubble: { padding:'12px 16px', borderRadius:14, fontSize:'1rem', lineHeight:1.5, overflowWrap:'break-word', maxWidth:360 },
    own:    { background:'#6366f1', color:'#fff', borderBottomRightRadius:4 },
    other:  { background:'#2d2d4e', color:'#e2e8f0', borderBottomLeftRadius:4 },
    media:  { padding:4, borderRadius:14 },
    time:   { color:'#6b7280', fontSize:'0.72rem', margin:'2px 4px 0' },
    img:    { width:'100%', borderRadius:10, display:'block', maxHeight:400, objectFit:'cover', cursor:'pointer' },
    video:  { width:'100%', borderRadius:10, maxHeight:400 },
    file:   { display:'flex', alignItems:'center', gap:12, padding:'8px 12px', background:'rgba(0,0,0,0.2)', borderRadius:10, textDecoration:'none', color:'inherit', minWidth:240 },
    fname:  { color:'#e2e8f0', fontSize:'0.88rem', fontWeight:600, margin:0, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
    cap:    { color:'rgba(255,255,255,0.75)', fontSize:'0.82rem', margin:'4px 4px 0', fontStyle:'italic' },
    menuBtn: { background:'transparent', border:'none', color:'#9ca3af', cursor:'pointer', padding:'4px 8px', borderRadius:'4px', fontSize:'1rem' },
    menu:   { position:'absolute', top:'100%', right: isOwn ? 0 : 'auto', left: isOwn ? 'auto' : 0, marginTop:4, background:'#313338', borderRadius:8, boxShadow:'0 4px 12px rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', minWidth:140, zIndex:100 },
    menuItem: { display:'flex', alignItems:'center', gap:8, padding:'10px 14px', color:'#e2e8f0', fontSize:'0.88rem', cursor:'pointer', border:'none', background:'none', width:'100%', textAlign:'left' },
    editInput: { background:'rgba(0,0,0,0.2)', border:'1px solid #6366f1', borderRadius:8, color:'#fff', padding:'8px 12px', fontSize:'1rem', width:'100%', outline:'none', resize:'none' },
  };

  const isMedia = ['giphy','image','video'].includes(msg.type);
  
  const content = () => {
    if (isEditing) {
      return (
        <div>
          <textarea
            ref={editInputRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            style={s.editInput}
            rows={3}
          />
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={handleSaveEdit} style={{ ...s.menuItem, background:'#6366f1', borderRadius:6, color:'#fff', justifyContent:'center' }}>
              Sauvegarder
            </button>
            <button onClick={handleCancelEdit} style={{ ...s.menuItem, background:'rgba(0,0,0,0.2)', borderRadius:6, justifyContent:'center' }}>
              Annuler
            </button>
          </div>
        </div>
      );
    }
    if (msg.type === 'giphy' || msg.type === 'image') return (
      <div>
        <a href={att?.secureUrl||att?.url} target="_blank" rel="noreferrer">
          <img src={att?.secureUrl||att?.url} alt={att?.giphyTitle||att?.filename||'media'} style={s.img} loading="lazy" />
        </a>
        {msg.content && <p style={s.cap}>{msg.content}</p>}
      </div>
    );
    if (msg.type === 'video') return <video src={att?.secureUrl||att?.url} controls style={s.video} />;
    if (msg.type === 'audio') return (
      <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:220 }}>
        <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(99,102,241,0.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <div style={{ flex:1 }}>
          <p style={{ color:'#c4b5fd', fontSize:'0.78rem', fontWeight:600, margin:'0 0 4px' }}>Message vocal</p>
          <audio src={att?.secureUrl||att?.url} controls style={{ width:'100%', maxWidth:200, height:28 }} />
        </div>
      </div>
    );
    if (msg.type === 'file') return (
      <a href={att?.secureUrl||att?.url} target="_blank" rel="noreferrer" style={s.file}>
        <span style={{ fontSize:'1.8rem' }}>{fileIcon(att?.format)}</span>
        <div><p style={s.fname}>{att?.filename}</p><p style={{ color:'#9ca3af', fontSize:'0.75rem', margin:'2px 0 0' }}>{formatBytes(att?.bytes)}</p></div>
        <span style={{ marginLeft:'auto', color:'#9ca3af' }}>⬇</span>
      </a>
    );
    if (msg.type === 'system') return <em style={{ color:'#9ca3af', fontSize:'0.85rem' }}>{msg.content}</em>;
    return <span>{msg.content}</span>;
  };

  if (isDeleting) return null;

  return (
    <div style={{ ...s.row, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
      {!isOwn && <div style={{ ...s.av, background: msg.author?.avatar||'#6366f1' }}>{msg.author?.username?.[0]?.toUpperCase()}</div>}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {!isOwn && <p style={{ color:'#9ca3af', fontSize:'0.78rem', margin:'0 0 3px 4px' }}>{msg.author?.username}</p>}
          {isOwn && !isEditing && (
            <div ref={menuRef} style={{ position:'relative' }}>
              <button 
                onClick={() => setShowMenu(!showMenu)}
                style={s.menuBtn}
                title="Options"
              >
                ⋮
              </button>
              {showMenu && (
                <div style={s.menu}>
                  <button onClick={handleEdit} style={s.menuItem} className="hover:bg-[#404249]">
                    Modifier
                  </button>
                  <button onClick={handleDelete} style={{ ...s.menuItem, color:'#ef4444' }} className="hover:bg-[#404249]">
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ ...s.bubble, ...(isOwn?s.own:s.other), ...(isMedia?s.media:{}) }}>{content()}</div>
        <MessageReactions
          messageId={msg._id}
          reactions={msg.reactions || {}}
          currentUser={currentUser}
          emit={emit}
          isOwn={isOwn}
        />
        <p style={{ ...s.time, textAlign: isOwn?'right':'left' }}>
          {new Date(msg.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
          {msg.createdAt !== msg.updatedAt && <span style={{ marginLeft:4, fontStyle:'italic' }}></span>}
        </p>
      </div>
      {isOwn && <div style={{ ...s.av, background:'#6366f1', marginLeft:8, marginRight:0 }}>{msg.author?.username?.[0]?.toUpperCase()}</div>}
    </div>
  );
}
