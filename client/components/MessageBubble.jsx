const formatBytes = (b) => {
  if (!b) return '';
  if (b < 1024) return `${b} o`;
  if (b < 1024**2) return `${(b/1024).toFixed(1)} Ko`;
  return `${(b/1024**2).toFixed(1)} Mo`;
};
const fileIcon = (f) => ({ pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',zip:'📦',txt:'🗒️',mp3:'🎵',wav:'🎵',mp4:'🎬',mov:'🎬' }[f?.toLowerCase()] || '📎');

export default function MessageBubble({ msg, isOwn }) {
  const att = msg.attachment;
  const s = {
    row:    { display:'flex', alignItems:'flex-end', gap:8 },
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
  };
  const isMedia = ['giphy','image','video'].includes(msg.type);
  const content = () => {
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
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:'1.8rem' }}>🎵</span>
        <div><p style={s.fname}>{att?.filename}</p><audio src={att?.secureUrl||att?.url} controls style={{ width:220, marginTop:4 }} /></div>
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

  return (
    <div style={{ ...s.row, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
      {!isOwn && <div style={{ ...s.av, background: msg.author?.avatar||'#6366f1' }}>{msg.author?.username?.[0]?.toUpperCase()}</div>}
      <div>
        {!isOwn && <p style={{ color:'#9ca3af', fontSize:'0.78rem', margin:'0 0 3px 4px' }}>{msg.author?.username}</p>}
        <div style={{ ...s.bubble, ...(isOwn?s.own:s.other), ...(isMedia?s.media:{}) }}>{content()}</div>
        <p style={{ ...s.time, textAlign: isOwn?'right':'left' }}>
          {new Date(msg.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
        </p>
      </div>
      {isOwn && <div style={{ ...s.av, background:'#6366f1', marginLeft:8, marginRight:0 }}>{msg.author?.username?.[0]?.toUpperCase()}</div>}
    </div>
  );
}