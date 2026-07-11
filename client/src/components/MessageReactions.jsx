import { useState } from 'react';
import { SmilePlus } from 'lucide-react';

/**
 * MessageReactions — Réactions emoji sur les messages
 *
 * Affiche les réactions existantes et permet d'en ajouter/retirer.
 * Les mises à jour sont envoyées via WebSocket (emit).
 *
 * Props :
 *   messageId   — identifiant du message
 *   reactions   — objet { emoji: [userId, ...], ... }
 *   currentUser — utilisateur connecté ({ _id, username })
 *   emit        — fonction WebSocket pour envoyer des événements
 *   isOwn       — si le message appartient à l'utilisateur courant
 */

const AVAILABLE_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function MessageReactions({ messageId, reactions = {}, currentUser, emit, isOwn }) {
  const [showPicker, setShowPicker] = useState(false);

  const hasReacted = (emoji) => reactions[emoji]?.includes(currentUser?._id);

  const toggleReaction = (emoji) => {
    if (!currentUser || !emit) return;
    const event = hasReacted(emoji) ? 'remove_reaction' : 'add_reaction';
    emit(event, { messageId, emoji });
    setShowPicker(false);
  };

  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);

  const st = {
    container: { position: 'relative', marginTop: 4 },
    reactions: { display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
    badge: (reacted) => ({
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 12,
      background: reacted ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)',
      border: reacted ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
      cursor: 'pointer', fontSize: '0.85rem', color: '#e2e8f0',
      transition: 'all 0.15s',
    }),
    addBtn: {
      width: 24, height: 24, borderRadius: '50%',
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.15)',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#9ca3af', transition: 'background .15s',
    },
    picker: {
      position: 'absolute', bottom: '100%',
      ...(isOwn ? { right: 0 } : { left: 0 }),
      marginBottom: 6, background: '#313338',
      borderRadius: 12, padding: '8px 10px',
      display: 'flex', gap: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      border: '1px solid rgba(255,255,255,0.1)', zIndex: 50,
    },
    emojiBtn: (reacted) => ({
      fontSize: '1.3rem', cursor: 'pointer', border: 'none',
      padding: '4px 6px', borderRadius: 8,
      background: reacted ? 'rgba(99,102,241,0.3)' : 'transparent',
      transition: 'transform 0.1s',
    }),
  };

  return (
    <div style={st.container}>
      <div style={st.reactions}>
        {reactionEntries.map(([emoji, users]) => (
          <button
            key={emoji}
            onClick={() => toggleReaction(emoji)}
            style={st.badge(hasReacted(emoji))}
            title={`${users.length} réaction${users.length > 1 ? 's' : ''}`}
          >
            <span>{emoji}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{users.length}</span>
          </button>
        ))}

        <button
          onClick={() => setShowPicker(!showPicker)}
          style={st.addBtn}
          title="Ajouter une réaction"
        >
          <SmilePlus size={13} />
        </button>

        {showPicker && (
          <div style={st.picker}>
            {AVAILABLE_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => toggleReaction(emoji)}
                style={st.emojiBtn(hasReacted(emoji))}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
