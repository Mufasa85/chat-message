import { useState, useRef, useEffect } from 'react';
import { useChat } from '../src/context/ChatContext';

const formatBytes = (b) => {
  if (!b) return '';
  if (b < 1024) return `${b} o`;
  if (b < 1024**2) return `${(b/1024).toFixed(1)} Ko`;
  return `${(b/1024**2).toFixed(1)} Mo`;
};
const fileIcon = (f) => ({ pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',zip:'📦',txt:'🗒️',mp3:'🎵',wav:'🎵',mp4:'🎬',mov:'🎬' }[f?.toLowerCase()] || '📎');

const toDownloadUrl = (url, filename) => {
  if (!url || !url.includes('cloudinary.com')) return url;
  const safe = (filename || 'fichier').replace(/[^a-zA-Z0-9._-]/g, '_');
  return url.replace('/upload/', `/upload/fl_attachment:${safe}/`);
};

export default function MessageBubble({ msg, isOwn, onReply }) {
  const { currentRoom, updateMessage, deleteMessage } = useChat();
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

  const handleReply = () => {
    setShowMenu(false);
    onReply?.({
      _id: msg._id,
      content: msg.content,
      type: msg.type,
      author: msg.author,
    });
  };

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
    bubble: { display:'inline-block', padding:'10px 14px', borderRadius:14, fontSize:'0.95rem', lineHeight:1.5, whiteSpace:'pre-wrap', wordBreak:'normal', overflowWrap:'anywhere', maxWidth:'72vw' },
    own:    { background:'#6366f1', color:'#fff', borderBottomRightRadius:4 },
    other:  { background:'#2d2d4e', color:'#e2e8f0', borderBottomLeftRadius:4 },
    media:  { padding:4, borderRadius:14 },
    time:   { color:'#6b7280', fontSize:'0.72rem', margin:'2px 4px 0' },
    img:    { width:'100%', borderRadius:10, display:'block', maxHeight:400, objectFit:'cover', cursor:'pointer' },
    video:  { width:'100%', borderRadius:10, maxHeight:400 },
    file:   { display:'flex', alignItems:'center', gap:12, padding:'8px 12px', background:'rgba(0,0,0,0.2)', borderRadius:10, textDecoration:'none', color:'inherit', minWidth:240 },
    fname:  { color:'#e2e8f0', fontSize:'0.88rem', fontWeight:600, margin:0, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
    cap:    { color:'rgba(255,255,255,0.75)', fontSize:'0.82rem', margin:'4px 4px 0', fontStyle:'italic' },
    menuBtn: { background:'rgba(0,0,0,0.35)', border:'none', color:'#d1d5db', cursor:'pointer', padding:'2px 7px', borderRadius:6, fontSize:'1rem', lineHeight:1, backdropFilter:'blur(4px)' },
    menu:   { position:'absolute', top:'100%', right:0, marginTop:4, background:'#313338', borderRadius:8, boxShadow:'0 4px 12px rgba(0,0,0,0.4)', border:'1px solid rgba(255,255,255,0.1)', minWidth:140, zIndex:100 },
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
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', minWidth:240, maxWidth:320 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, opacity:0.65 }}>
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
        <audio src={att?.secureUrl||att?.url} controls style={{ flex:1, height:32, minWidth:0 }} />
      </div>
    );
    if (msg.type === 'file') return (
      <a href={toDownloadUrl(att?.secureUrl||att?.url, att?.filename)} download={att?.filename} target="_blank" rel="noreferrer" style={s.file}>
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
        {!isOwn && <p style={{ color:'#9ca3af', fontSize:'0.78rem', margin:'0 0 3px 4px' }}>{msg.author?.username}</p>}
        <div style={{ position:'relative' }}>
          {msg.replyTo && (
            <div style={{ background: isOwn ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.06)', borderLeft:'3px solid #818cf8', borderRadius:'6px 6px 0 0', padding:'6px 10px', marginBottom:2, maxWidth:360, cursor:'default' }}>
              <p style={{ color:'#818cf8', fontSize:'0.72rem', fontWeight:700, margin:'0 0 1px' }}>{msg.replyTo.author?.username}</p>
              <p style={{ color:'#9ca3af', fontSize:'0.78rem', margin:0, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis', maxWidth:280 }}>
                {msg.replyTo.type === 'audio' ? '🎤 Message vocal' : msg.replyTo.type === 'image' ? '🖼 Image' : msg.replyTo.content}
              </p>
            </div>
          )}
          <div style={{ ...s.bubble, ...(isOwn?s.own:s.other), ...(isMedia?s.media:{}), ...(msg.replyTo ? { borderTopLeftRadius:0, borderTopRightRadius:0 } : {}) }}>{content()}</div>
          {!isEditing && (
            <div ref={menuRef} style={{ position:'absolute', top:6, right: isOwn ? -28 : 'auto', left: isOwn ? 'auto' : -28, zIndex:10 }}>
              <button onClick={() => setShowMenu(!showMenu)} style={s.menuBtn} title="Options">⋮</button>
              {showMenu && (
                <div style={{ ...s.menu, right: isOwn ? 0 : 'auto', left: isOwn ? 'auto' : 0 }}>
                  <button onClick={handleReply} style={s.menuItem} className="hover:bg-[#404249]">Répondre</button>
                  {isOwn && <button onClick={handleEdit} style={s.menuItem} className="hover:bg-[#404249]">Modifier</button>}
                  {isOwn && <button onClick={handleDelete} style={{ ...s.menuItem, color:'#ef4444' }} className="hover:bg-[#404249]">Supprimer</button>}
                </div>
              )}
            </div>
          )}
        </div>
        <p style={{ ...s.time, textAlign: isOwn?'right':'left' }}>
          {new Date(msg.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
          {msg.createdAt !== msg.updatedAt && <span style={{ marginLeft:4, fontStyle:'italic' }}></span>}
        </p>
      </div>
      {isOwn && <div style={{ ...s.av, background:'#6366f1', marginLeft:8, marginRight:0 }}>{msg.author?.username?.[0]?.toUpperCase()}</div>}
    </div>
  );
}
