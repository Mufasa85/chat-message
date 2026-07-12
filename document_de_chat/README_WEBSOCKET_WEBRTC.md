# 📡 README — WebSocket & WebRTC expliqués simplement

## Pourquoi deux technologies différentes ?

| | WebSocket | WebRTC |
|---|---|---|
| **Pour quoi** | Texte, notifications, signaux | Audio, vidéo en direct |
| **Passe par le serveur** | ✅ Toujours | ❌ Direct entre navigateurs |
| **Vitesse** | Rapide | Ultra-rapide (peer-to-peer) |
| **Usage dans le projet** | Messages, typing, DMs, notifications d'appel | Flux vidéo/audio de l'appel |

---

# PARTIE 1 — WebSocket

## C'est quoi un WebSocket ?

HTTP classique : **le client demande, le serveur répond, la connexion se ferme**.
C'est comme envoyer une lettre — tu attends la réponse, puis c'est fini.

WebSocket : **la connexion reste ouverte en permanence**.
C'est comme un appel téléphonique — les deux parties peuvent parler quand elles veulent.

```
HTTP classique :
Client → "Donne-moi les messages" → Serveur
Client ← "Voici les messages"     ← Serveur
[CONNEXION FERMÉE]

WebSocket :
Client ↔ Serveur  [CONNEXION PERMANENTE]
Client → "send_message: Bonjour"
Serveur → "new_message: Bonjour" → Client A
Serveur → "new_message: Bonjour" → Client B
Serveur → "new_message: Bonjour" → Client C
```

---

## Le hook `useWebSocket.js` — Explication ligne par ligne

```js
// Fichier : client/src/hooks/useWebSocket.js

export const useWebSocket = ({ token, onMessage, onOpen, onClose }) => {
```
Ce hook reçoit :
- `token` : le JWT de l'utilisateur (pour s'authentifier)
- `onMessage` : fonction appelée quand un message arrive
- `onOpen` / `onClose` : fonctions appelées quand la connexion s'ouvre/ferme

```js
  const wsRef = useRef(null);           // Référence à la connexion WebSocket
  const reconnectTimer = useRef(null);  // Timer pour la reconnexion automatique
  const attemptsRef = useRef(0);        // Nombre de tentatives de reconnexion
```
`useRef` = une boîte qui garde une valeur **sans provoquer de re-render**.
Utile pour stocker la connexion WS car si on la mettait dans `useState`, React re-rendrerait tout à chaque fois.

```js
  const connect = () => {
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
```
On crée la connexion. Le token est passé dans l'URL pour que le serveur puisse identifier qui se connecte.

```js
    ws.onopen = () => {
      attemptsRef.current = 0;  // Réinitialise le compteur de tentatives
      onOpenRef.current?.();    // Appelle la fonction onOpen si elle existe
    };
```
Quand la connexion est établie.

```js
    ws.onmessage = (e) => {
      onMessageRef.current?.(JSON.parse(e.data));
    };
```
Quand un message arrive du serveur. `e.data` est une chaîne JSON — on la parse pour obtenir l'objet `{ event, data }`.

```js
    ws.onclose = (e) => {
      if (e.code === 4001) return;  // Code "non autorisé" → pas de reconnexion
      
      const delay = Math.min(1000 * 2 ** attemptsRef.current, 30000);
      // 1re tentative : 1s, 2e : 2s, 3e : 4s, 4e : 8s... max 30s
      reconnectTimer.current = setTimeout(connect, delay);
    };
```
**Reconnexion exponentielle** : si la connexion coupe (réseau instable), on réessaie automatiquement avec des délais croissants.

```js
  const emit = useCallback((event, data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }));
    }
  }, []);
```
La fonction `emit` — c'est ce qu'on appelle partout dans le projet pour envoyer un message au serveur.
Elle vérifie d'abord que la connexion est ouverte (`WebSocket.OPEN = 1`).

---

## Le serveur WebSocket — `WsServer.js`

Sur le serveur, voici comment un message est traité :

```js
// Quand un client envoie un message
ws.on('message', async (raw) => {
  const { event, data } = JSON.parse(raw);

  switch (event) {
    case 'send_message':
      // 1. Sauvegarder en base de données
      const msg = await Message.create({ ... });
      
      // 2. Diffuser à tous les membres du salon
      broadcast(roomId, 'new_message', msg);
      break;

    case 'typing':
      // Diffuser "untel est en train de taper" à tout le salon
      broadcast(roomId, 'typing', { userId, username, isTyping });
      break;

    case 'join_room':
      // Enregistrer que cet utilisateur est dans ce salon
      userRoomMap.set(userId, roomId);
      break;
  }
});
```

La fonction `broadcast` envoie à **tous** les clients connectés à un salon :
```js
function broadcast(roomId, event, data) {
  for (const [ws, info] of clients) {
    if (info.roomId === roomId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, data }));
    }
  }
}
```

---

## Le routeur d'événements — `ChatContext.jsx`

C'est le **cerveau** qui reçoit tous les événements WebSocket et met à jour l'interface :

```js
const onMessage = useCallback(({ event, data }) => {
  switch (event) {

    case 'new_message':
      // Ajouter le message à la liste affichée
      setMessages((prev) => [...prev, data]);
      // Si c'est un autre salon → incrémenter le badge non-lu
      if (data.room !== currentRoom._id) {
        setUnreadCounts((prev) => ({ ...prev, [data.room]: prev[data.room] + 1 }));
      }
      break;

    case 'typing':
      // Afficher "Alice est en train de taper..."
      if (data.isTyping) {
        setTypingUsers((prev) => [...prev, { userId: data.userId, username: data.username }]);
      } else {
        setTypingUsers((prev) => prev.filter(u => u.userId !== data.userId));
      }
      break;

    case 'incoming_call':
      // Déclencher l'UI d'appel entrant
      webrtcRef.current.handleIncomingCall(data);
      break;

    case 'ice_candidate':
      // Passer le candidat réseau à WebRTC
      webrtcRef.current.handleIceCandidate(data);
      break;
  }
}, [currentRoom]);
```

---

## Schéma complet d'un message de groupe

```
Alice tape "Salut" et appuie Entrée
│
├─ ChatPage.jsx → sendMessage("Salut")
├─ ChatContext.jsx → emit('send_message', { roomId: "abc", content: "Salut" })
├─ useWebSocket.js → ws.send(JSON.stringify({ event: 'send_message', data: {...} }))
│
│                    [SERVEUR]
├─ WsServer.js reçoit 'send_message'
├─ Crée Message en MongoDB
├─ broadcast(roomId, 'new_message', message)
│
│  [TOUS LES CLIENTS DU SALON]
├─ useWebSocket.js → onmessage → JSON.parse
├─ ChatContext.jsx → case 'new_message': setMessages([...prev, data])
└─ React re-render → la bulle "Salut" apparaît
```

---

# PARTIE 2 — WebRTC (Appels vidéo/audio)

## C'est quoi WebRTC ?

WebRTC (Web Real-Time Communication) permet deux navigateurs de communiquer **directement entre eux** (peer-to-peer) pour l'audio et la vidéo, **sans passer par le serveur** pour les données médias.

Le serveur sert uniquement de **messager** pour établir la connexion initiale (signaling).

```
Sans WebRTC :
Alice → Serveur → Bob    (vidéo passe par le serveur = lent, coûteux)

Avec WebRTC :
Alice ←————————→ Bob     (vidéo directe entre eux = rapide, gratuit)
         ↑
   Le serveur aide juste
   à établir la connexion
   (signaling via WebSocket)
```

---

## Le problème du NAT — Pourquoi c'est compliqué

Sur Internet, ton téléphone n'a pas une adresse IP publique directe. Il est derrière une "box" (routeur NAT).

```
Alice (192.168.1.5, derrière Freebox)
        ↓ comment Bob peut la trouver ?
Bob   (192.168.0.10, derrière Orange)
```

Pour résoudre ça, WebRTC utilise **trois types de serveurs** :

### STUN (Session Traversal Utilities for NAT)
Découvre ton adresse IP publique :
```
Alice → Serveur STUN : "Quelle est mon adresse publique ?"
Serveur STUN → Alice : "Tu es vue comme 82.45.12.3:54321"
```
Gratuit, utilisé pour les connexions simples (même opérateur).

### TURN (Traversal Using Relays around NAT)
Si STUN ne suffit pas (réseaux très restrictifs), TURN relaie les données :
```
Alice → Serveur TURN → Bob
```
Payant en général — ici on utilise **Metered.ca** (gratuit limité).

### ICE (Interactive Connectivity Establishment)
Essaie toutes les possibilités dans l'ordre pour trouver la meilleure connexion :
1. Connexion directe (même réseau)
2. Via STUN (IP publique)
3. Via TURN (relais)

---

## Processus d'établissement d'un appel — Étape par étape

```
ALICE (appelle)                                    BOB (reçoit)

1. Alice clique "Appel vidéo"
   startCall(bob, 'video')
   │
2. Accès caméra/micro
   getUserMedia({ audio, video })
   │
3. Crée RTCPeerConnection
   createPeerConnection(bobId)
   │
4. Crée une "offre" (description de sa config)
   createOffer() → sdp (Session Description Protocol)
   │
5. ──── WebSocket ────────────────────────────────→
   emit('call_offer', { sdp, callType: 'video' })
                                                   │
                                              6. Bob reçoit l'offre
                                                 handleIncomingCall({ sdp })
                                                   │
                                              7. Bob voit la notification
                                                 "Alice appelle..."
                                                   │
                                              8. Bob accepte
                                                 acceptCall()
                                                   │
                                              9. Accès caméra/micro
                                                 getUserMedia(...)
                                                   │
                                              10. Crée RTCPeerConnection
                                                  setRemoteDescription(sdp)
                                                   │
                                              11. Crée une "réponse"
                                                  createAnswer() → sdp
                                                   │
   ←──── WebSocket ─────────────────────────────── │
   emit('call_answer', { sdp, accepted: true })
   │
12. Alice reçoit la réponse
    setRemoteDescription(sdp)
    │
13. ──── ICE candidates ─────────────────────────→
    (échange d'adresses réseau via WebSocket)
   ←──── ICE candidates ──────────────────────────
    │
14. Connexion directe établie ! 🎉
    Flux vidéo/audio passe directement
    Alice ←────────────────────────────→ Bob
```

---

## Le hook `useWebRTC.js` — Les fonctions clés

### `getLocalStream(type)`
```js
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,   // Annule l'écho (pas de larsen)
    noiseSuppression: true,   // Réduit le bruit de fond
    autoGainControl:  true,   // Ajuste le volume automatiquement
  },
  video: type === 'video' ? {
    width:     { ideal: 640 },  // Résolution idéale
    frameRate: { ideal: 24 },   // 24 images/seconde
  } : false,
});
```
Demande l'accès à la caméra et au micro. Le navigateur affiche la popup "Autoriser ?".

### `createPeerConnection(targetId)`
```js
const iceConfig = await fetchIceServers(); // Récupère les serveurs TURN de Metered
const pc = new RTCPeerConnection(iceConfig);

// Quand on trouve une adresse réseau (ICE candidate)
pc.onicecandidate = (e) => {
  if (e.candidate) {
    // On l'envoie à l'autre via WebSocket
    emit('ice_candidate', { targetUserId: targetId, candidate: e.candidate });
  }
};

// Quand on reçoit le flux vidéo/audio de l'autre
pc.ontrack = (e) => {
  attachRemoteStream(e.streams[0]); // Afficher la vidéo dans <video>
};
```

### `startCall(targetUser, type)` — Côté appelant
```js
const stream  = await getLocalStream(type);    // 1. Accès caméra
const pc      = await createPeerConnection(id); // 2. Créer la connexion
const offer   = await pc.createOffer();         // 3. Créer l'offre
await pc.setLocalDescription(offer);            // 4. Enregistrer localement
emit('call_offer', { sdp: offer, callType: type }); // 5. Envoyer à l'autre
```

### `acceptCall()` — Côté receveur
```js
const stream = await getLocalStream(type);       // 1. Accès caméra
const pc     = await createPeerConnection(id);   // 2. Créer la connexion
await pc.setRemoteDescription(sdp);              // 3. Enregistrer l'offre reçue
const answer = await pc.createAnswer();          // 4. Créer la réponse
await pc.setLocalDescription(answer);            // 5. Enregistrer localement
emit('call_answer', { sdp: answer, accepted: true }); // 6. Répondre
```

### Optimisation du bitrate (éviter les freezes)
```js
pc.onconnectionstatechange = () => {
  if (pc.connectionState === 'connected') {
    // Limiter la qualité pour les réseaux mobiles
    pc.getSenders().forEach(async (sender) => {
      const params = sender.getParameters();
      if (sender.track.kind === 'video') {
        params.encodings[0].maxBitrate = 500_000; // Max 500 kbps pour la vidéo
      } else if (sender.track.kind === 'audio') {
        params.encodings[0].maxBitrate = 64_000;  // Max 64 kbps pour l'audio
      }
      await sender.setParameters(params);
    });
  }
};
```

---

## Schéma complet d'un appel vidéo

```
useWebRTC.js                ChatContext.jsx              WsServer.js
     │                            │                           │
     │ startCall(bob, 'video')    │                           │
     │ getUserMedia()             │                           │
     │ createOffer()              │                           │
     │──emit('call_offer', sdp)──→│──WebSocket send──────────→│
     │                            │                           │ trouve Bob
     │                            │                           │ envoie 'incoming_call'
     │                            │←──────────────────────────│
     │                            │ handleIncomingCall()      │
     │                            │→ webrtc.handleIncoming()  │
     │ setCallState('incoming')   │                           │
     │ [Bob voit la notif]        │                           │
     │                            │                           │
     │ acceptCall()               │                           │
     │ getUserMedia()             │                           │
     │ setRemoteDescription()     │                           │
     │ createAnswer()             │                           │
     │──emit('call_answer', sdp)─→│──WebSocket send──────────→│
     │                            │                           │ trouve Alice
     │                            │                           │ envoie 'call_answer'
     │                            │←──────────────────────────│
     │ setRemoteDescription()     │                           │
     │                            │                           │
     │──emit('ice_candidate')────→│──────────────────────────→│
     │←──emit('ice_candidate')────│←──────────────────────────│
     │                            │                           │
     │ [CONNEXION P2P ÉTABLIE]    │                           │
     │ Vidéo directe Alice↔Bob   │                           │
```

---

## `fetchIceServers()` — Pourquoi on fetch les serveurs ?

```js
async function fetchIceServers() {
  const res = await fetch(
    `https://chat-message.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`
  );
  const servers = await res.json();
  // servers = [
  //   { urls: "stun:...", ... },
  //   { urls: "turn:...", username: "abc", credential: "xyz" },
  //   { urls: "turns:...", username: "abc", credential: "xyz" },
  // ]
}
```

Les credentials TURN expirent régulièrement pour la sécurité. En les fetchant à chaque appel, on est sûr d'avoir des credentials valides. Le résultat est **mis en cache** (`cachedIceServers`) pour ne pas refetcher à chaque appel.
