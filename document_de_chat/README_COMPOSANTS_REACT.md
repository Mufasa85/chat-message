# ⚛️ README — Composants React expliqués pour la soutenance

## C'est quoi React ?

React est une **bibliothèque JavaScript** pour construire des interfaces utilisateur.
L'idée principale : **l'interface = le résultat de données**.

```
données (state) → React → interface HTML affichée
```

Quand les données changent → React met à jour **uniquement** ce qui a changé dans la page (pas tout recharger).

---

## Les concepts fondamentaux à maîtriser

### 1. Composant
Un composant = une **fonction JavaScript qui retourne du HTML** (JSX).

```jsx
function MessageBubble({ msg, isOwn }) {
  return (
    <div style={{ background: isOwn ? 'blue' : 'grey' }}>
      {msg.content}
    </div>
  );
}
```

- **Props** (`msg`, `isOwn`) = les paramètres qu'on passe au composant depuis l'extérieur (lecture seule)
- **JSX** = HTML écrit dans JavaScript (le navigateur ne le comprend pas directement, Vite le compile)

---

### 2. State (`useState`)
Le state = **données internes** d'un composant. Quand elles changent, React re-affiche.

```jsx
const [text, setText] = useState('');  // text = valeur, setText = modifier

// Mauvais — React ne détecte pas le changement :
text = 'Bonjour';          // ❌ jamais faire ça

// Bon — React re-render automatiquement :
setText('Bonjour');        // ✅
```

---

### 3. Effect (`useEffect`)
Code qui s'exécute **après** que le composant s'affiche — pour les effets de bord (appels API, connexions...).

```jsx
useEffect(() => {
  // Exécuté après le premier affichage
  fetchRooms();
}, []);  // [] = une seule fois au démarrage

useEffect(() => {
  // Exécuté à chaque fois que currentRoom change
  loadMessages();
}, [currentRoom]);  // dépendance
```

---

### 4. Ref (`useRef`)
Une boîte qui garde une valeur **sans provoquer de re-render**.
Utile pour les connexions WebSocket, les références DOM (scroll, input focus...).

```jsx
const bottomRef = useRef(null);  // référence à un élément DOM
bottomRef.current?.scrollIntoView();  // scroller vers cet élément

const wsRef = useRef(null);      // garde la connexion WebSocket
// Pas de re-render quand wsRef.current change ✓
```

---

### 5. Callback (`useCallback`)
Mémoïse une fonction pour éviter de la recréer à chaque render.

```jsx
const sendMessage = useCallback((content) => {
  emit('send_message', { content });
}, [emit]);  // ne recrée la fonction que si emit change
```

---

### 6. Memo (`useMemo`)
Mémoïse une valeur calculée pour éviter de la recalculer à chaque render.

```jsx
const contextValue = useMemo(() => ({
  rooms, messages, sendMessage, ...
}), [rooms, messages, sendMessage]);
// Ne recrée l'objet que si une des dépendances change
```

---

### 7. Context
Partage des données entre **tous** les composants sans les passer en props à chaque niveau.

```jsx
// Créer le contexte
const ChatContext = createContext(null);

// Fournir les données (en haut de l'arbre)
<ChatContext.Provider value={{ rooms, messages, sendMessage }}>
  <App />
</ChatContext.Provider>

// Consommer n'importe où dans l'arbre
const { rooms, sendMessage } = useContext(ChatContext);
```

---

## Les fichiers importants — Expliqués

---

### `main.jsx` — Le point de départ

```jsx
ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <ChatProvider>
      <App />
    </ChatProvider>
  </AuthProvider>
);
```

**Ce que ça fait :** Lance React dans la `<div id="root">` de `index.html`.
Les Providers enveloppent toute l'app pour que **n'importe quel composant** puisse accéder aux données auth et chat.

---

### `App.jsx` — Le routeur principal

```jsx
export default function App() {
  const { token } = useAuth();  // Est-ce que l'utilisateur est connecté ?

  if (!token) return <AuthPage />;  // Non → page de connexion
  return <ChatPage />;              // Oui → application principale
}
```

**Ce que ça fait :** La logique de routage la plus simple possible.
Si tu as un token JWT → tu es connecté → tu vois le chat.
Si non → tu vois la page de connexion.

---

### `AuthContext.jsx` — Gestion de la connexion

```jsx
export const AuthProvider = ({ children }) => {
  // Lire depuis localStorage au démarrage (persiste après fermeture du navigateur)
  const [user,  setUser]  = useState(() => JSON.parse(localStorage.getItem('user')));
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  const login = useCallback(async (username, password) => {
    // 1. Appel API
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    // 2. Sauvegarder le token
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    // 3. Mettre à jour le state → App.jsx re-render → <ChatPage> s'affiche
    setToken(data.token);
    setUser(data.user);
  }, []);

  // Exposer à tous les composants enfants
  return (
    <AuthContext.Provider value={{ user, token, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
};
```

**Pourquoi `localStorage` ?** Pour que l'utilisateur reste connecté même s'il ferme et rouvre le navigateur.

---

### `ChatContext.jsx` — Le cerveau de l'application

C'est le fichier le plus important. Il centralise :
- La connexion WebSocket
- Tous les états (rooms, messages, utilisateurs en ligne...)
- Toutes les actions (envoyer message, rejoindre salon, créer salon...)
- Le routage des événements WebSocket entrants

```jsx
export const ChatProvider = ({ children }) => {
  // ── États ──────────────────────────────────────────────
  const [rooms,       setRooms]       = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);

  // ── WebRTC (appels vidéo) ───────────────────────────────
  const webrtc = useWebRTC({ currentUser, emit: (...args) => emitRef.current?.(...args) });

  // ── Routage des événements WebSocket ───────────────────
  const onMessage = useCallback(({ event, data }) => {
    switch (event) {
      case 'new_message':
        setMessages((prev) => [...prev, data]);  // Ajouter à la liste
        break;
      case 'typing':
        // Mettre à jour qui est en train de taper
        break;
      case 'incoming_call':
        webrtc.handleIncomingCall(data);          // Déléguer à WebRTC
        break;
    }
  }, [currentRoom]);

  // ── Connexion WebSocket ─────────────────────────────────
  const { emit } = useWebSocket({ token, onMessage, onOpen, onClose });

  // ── Actions ─────────────────────────────────────────────
  const sendMessage = useCallback((content) => {
    emit('send_message', { roomId: currentRoom._id, content });
  }, [currentRoom]);

  const joinRoom = useCallback(async (room) => {
    setCurrentRoom(room);
    setMessages([]);
    // Charger les anciens messages via API REST
    const res = await fetch(`${API}/rooms/${room._id}/messages`, { headers: { Authorization: `Bearer ${token}` } });
    setMessages(await res.json());
    // Rejoindre le salon via WebSocket (pour recevoir les nouveaux)
    emit('join_room', { roomId: room._id });
  }, [token]);
};
```

**Pourquoi `emitRef` au lieu de `emit` directement pour WebRTC ?**
WebRTC est initialisé avant que `emit` existe. `emitRef` est une référence qui pointe toujours vers la version la plus récente de `emit`. C'est une astuce pour éviter les dépendances circulaires.

---

### `ChatPage.jsx` — L'écran principal

C'est la page la plus complexe. Elle affiche :
- La liste des salons (sidebar gauche)
- Les messages du salon actif (centre)
- La barre d'envoi de message (bas)
- Les utilisateurs en ligne (sidebar droite sur grand écran)

```jsx
export default function ChatPage() {
  // Récupérer tout depuis le contexte
  const { rooms, currentRoom, messages, fetchRooms, joinRoom, sendMessage } = useChat();
  const { user } = useAuth();

  // État local (propre à cette page uniquement)
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);

  // Charger les salons au démarrage
  useEffect(() => {
    fetchRooms();
  }, []);

  // Scroller en bas à chaque nouveau message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage(text, false, 300, replyTo?._id);
    setText('');
    setReplyTo(null);
  };

  return (
    <div>
      {/* Sidebar salons */}
      {rooms.map(room => (
        <div key={room._id} onClick={() => joinRoom(room)}>
          #{room.name}
        </div>
      ))}

      {/* Messages */}
      {messages.map(msg => (
        <MessageBubble
          key={msg._id}
          msg={msg}
          isOwn={msg.author._id === user._id}
          onReply={setReplyTo}
        />
      ))}

      {/* Input */}
      <input value={text} onChange={e => setText(e.target.value)} />
      <button onClick={handleSend}>Envoyer</button>
    </div>
  );
}
```

---

### `MessageBubble.jsx` — Une bulle de message

Composant "pur" — il reçoit des props et affiche. Pas d'appels API, pas de WebSocket.

```jsx
export default function MessageBubble({ msg, isOwn, onReply }) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Afficher le bon contenu selon le type de message
  const content = () => {
    if (msg.type === 'image')  return <img src={msg.attachment.secureUrl} />;
    if (msg.type === 'audio')  return <audio controls src={msg.attachment.secureUrl} />;
    if (msg.type === 'giphy')  return <img src={msg.attachment.url} />;
    if (msg.type === 'file')   return <a href={msg.attachment.secureUrl}>📎 {msg.attachment.filename}</a>;
    return <span>{msg.content}</span>;  // text par défaut
  };

  return (
    <div style={{ justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
      {/* Avatar (seulement pour les messages des autres) */}
      {!isOwn && <Avatar user={msg.author} />}

      <div>
        {/* Nom (seulement pour les autres) */}
        {!isOwn && <p>{msg.author.username}</p>}

        {/* Bulle colorée */}
        <div style={{ background: isOwn ? '#6366f1' : '#2d2d4e' }}>
          {content()}
        </div>

        {/* Heure */}
        <p>{new Date(msg.createdAt).toLocaleTimeString()}</p>
      </div>
    </div>
  );
}
```

**Patterns importants ici :**
- `isOwn` détermine l'alignement et la couleur → même composant, deux visuels
- `content()` est une fonction locale qui retourne du JSX selon `msg.type`
- Le menu contextuel (modifier, supprimer) est géré avec `useState(false)`

---

### `DMPage.jsx` — Messages privés

Fonctionne comme un panneau qui s'ouvre par-dessus le chat.
Différences avec ChatPage :
- Les messages vont dans la collection `DM` (pas `Message`)
- L'envoi utilise l'événement WebSocket `send_dm` (pas `send_message`)
- Pas de notion de "salon" — juste deux utilisateurs

```jsx
// Envoyer un message privé
const sendDM = () => {
  emit('send_dm', { toUserId: activeUser._id, content: text.trim() });
  // Optimistic update : afficher le message immédiatement sans attendre le serveur
  addOptimistic({ content: text.trim(), type: 'text' });
  setText('');
};

// Charger les conversations
useEffect(() => {
  fetch(`${API}/dm/conversations`, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.json())
    .then(setConversations);
}, []);
```

**Optimistic update** = afficher le message immédiatement dans l'UI, avant que le serveur confirme. Si le serveur échoue, on retire le message. Ça rend l'app plus réactive.

---

### `AuthPage.jsx` — Page de connexion

```jsx
export default function AuthPage() {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);  // true = login, false = inscription

  const handleSubmit = async (e) => {
    e.preventDefault();  // Empêche le rechargement de page (comportement HTML natif)
    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await register(username, password);
      }
      // Si ça réussit → AuthContext met à jour le token
      // → App.jsx détecte token !== null → affiche ChatPage
    } catch (err) {
      setError(err.message);  // Afficher l'erreur
    }
  };
}
```

**`e.preventDefault()`** — Sans ça, le formulaire HTML rechargerait la page entière à la soumission. En React on gère tout en JavaScript.

---

### `useFileUpload.jsx` — Upload de fichiers

```jsx
export const useFileUpload = () => {
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(async (file, roomId) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);      // Le fichier binaire
      formData.append('roomId', roomId);  // Quel salon

      const res = await fetch(`${API}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,  // Pas de Content-Type manuellement → le navigateur le gère
      });
      return await res.json();  // { type, attachment, message }
    } finally {
      setUploading(false);
    }
  }, [token]);

  return { upload, uploading };
};
```

**`FormData`** = façon standard d'envoyer des fichiers en HTTP. Contrairement au JSON, FormData peut contenir des données binaires (images, audio...).

---

## Architecture des données — Comment tout est lié

```
localStorage
│  token: "eyJhbG..."
│  user: { _id, username, avatar }
│
└─→ AuthContext
      │  user, token
      │  login(), logout(), register()
      │
      └─→ ChatContext
            │  rooms, currentRoom, messages
            │  onlineUsers, typingUsers
            │  sendMessage(), joinRoom()...
            │
            ├─→ useWebSocket    (connexion temps réel)
            ├─→ useWebRTC       (appels vidéo)
            │
            └─→ Pages & Composants
                  ChatPage.jsx     → useChat() → tout
                  DMPage.jsx       → useChat() → emit, user
                  MessageBubble    → props seulement (pas de contexte)
                  AuthPage.jsx     → useAuth() → login, register
```

---

## Mots-clés pour la soutenance

| Terme | Définition simple |
|---|---|
| **Composant** | Fonction JS qui retourne du HTML (JSX) |
| **Props** | Données passées du parent vers l'enfant (lecture seule) |
| **State** | Données internes du composant, déclenchent un re-render |
| **Context** | Données globales accessibles partout sans passer les props |
| **Hook** | Fonction qui utilise les fonctionnalités React (useState, useEffect...) |
| **Re-render** | React recalcule et met à jour l'affichage quand le state change |
| **useEffect** | Exécute du code après l'affichage (effets de bord) |
| **useCallback** | Mémoïse une fonction pour éviter de la recréer |
| **useMemo** | Mémoïse une valeur calculée |
| **useRef** | Référence stable sans provoquer de re-render |
| **Optimistic update** | Afficher le résultat avant la confirmation du serveur |
| **JWT** | Token d'authentification signé, stocké côté client |
| **FormData** | Objet pour envoyer fichiers + données via HTTP |

---

## Questions probables en soutenance et réponses

**Q : Pourquoi utiliser React plutôt que du HTML/JS classique ?**
> React gère automatiquement la mise à jour de l'interface quand les données changent. Sans React, il faudrait manuellement trouver les éléments DOM et les modifier — c'est complexe et sujet aux bugs.

**Q : C'est quoi la différence entre props et state ?**
> Props viennent du parent et sont en lecture seule. State est interne au composant et peut être modifié. Quand state change → React re-affiche.

**Q : Pourquoi useContext plutôt que passer les props ?**
> Sans Context, il faudrait passer `user`, `token`, `messages`... à chaque composant, même ceux qui ne s'en servent pas directement. Context évite ce "prop drilling".

**Q : Comment fonctionne l'authentification ?**
> L'utilisateur envoie pseudo + mot de passe. Le serveur vérifie avec bcrypt et retourne un JWT. Ce token est stocké dans localStorage et envoyé dans chaque requête dans le header Authorization. Le serveur vérifie le token à chaque requête.

**Q : Pourquoi WebSocket et pas juste des requêtes HTTP régulières ?**
> HTTP = le client demande, le serveur répond, connexion fermée. Pour les messages en temps réel, il faudrait faire des requêtes toutes les secondes (polling) — très inefficace. WebSocket garde la connexion ouverte et le serveur peut envoyer des données à n'importe quel moment.

**Q : Comment les messages sont-ils reçus en temps réel ?**
> WebSocket maintient une connexion permanente. Quand Alice envoie un message, le serveur le reçoit, le sauvegarde en MongoDB, puis le diffuse à tous les clients connectés au même salon via `broadcast()`. Chaque navigateur reçoit l'événement `new_message` et React met à jour la liste.
