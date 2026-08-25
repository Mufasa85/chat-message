# 📞 README — Fonctionnalités détaillées + Questions pièges de soutenance

---

## 1. 💬 Les messages texte

### Trajet complet d'un message

```
Utilisateur tape → handleSend() → sendMessage() → emit('send_message')
→ WebSocket → WsServer.js → handleSendMessage() → MongoDB → broadcast()
→ tous les membres reçoivent 'new_message' → setMessages() → React affiche
```

### Fichiers impliqués

| Fichier                               | Rôle                                                               |
| ------------------------------------- | ------------------------------------------------------------------ |
| `ChatPage.jsx` / `DMPage.jsx`         | L'utilisateur tape et clique "Envoyer"                             |
| `ChatContext.jsx` → `sendMessage()`   | Prépare et envoie via WebSocket                                    |
| `useWebSocket.js` → `emit()`          | Sérialise en JSON et envoie sur la connexion WS                    |
| `WsServer.js` → `handleSendMessage()` | Reçoit, valide, sauvegarde en BDD, diffuse                         |
| `Message` (modèle Mongoose)           | Schéma MongoDB : `room`, `author`, `content`, `type`, `attachment` |
| `MessageBubble.jsx`                   | Affiche le message selon son type                                  |

### Code clé — `handleSendMessage` (serveur)

```js
// WsServer.js
const handleSendMessage = async (
  ws,
  { roomId, content, type, attachment, ephemeral, ttl, replyTo },
) => {
  const state = clients.get(ws); // Qui envoie ?
  if (!content?.trim()) return; // Refuser les messages vides

  const message = await Message.create({
    // Sauvegarder en MongoDB
    room: roomId,
    author: state.user._id,
    content: content.trim().substring(0, 2000), // Max 2000 caractères
    type: type || "text",
    attachment,
    replyTo,
  });

  broadcast(roomId, "new_message", msgPayload); // Envoyer à tous les membres du salon
};
```

### Types de messages supportés

```
'text'   → message texte classique
'image'  → image uploadée sur Cloudinary
'audio'  → enregistrement vocal uploadé sur Cloudinary
'video'  → vidéo uploadée sur Cloudinary
'file'   → document (PDF, ZIP...) sur Cloudinary
'giphy'  → GIF animé depuis Giphy API
```

### Messages éphémères

Un message éphémère a un TTL (Time To Live). Il se supprime automatiquement.

```js
// Créer un message qui disparaît après 5 minutes (300 secondes)
sendMessage(content, true, 300);
//                   ↑     ↑
//               ephemeral ttl (secondes)
```

Le service `cleanupExpiredMessages.js` tourne toutes les 30 secondes côté serveur et supprime les messages dont `expiresAt < Date.now()`.

---

## 2. 🎤 Les messages vocaux

### Trajet complet

```
Micro → MediaRecorder API → Blob audio → FormData → POST /api/upload
→ Cloudinary (stockage) → URL sécurisée → Message.create() en BDD
→ message renvoyé au client → addMessage() → MessageBubble affiche <audio>
```

### Fichiers impliqués

| Fichier                          | Rôle                                                      |
| -------------------------------- | --------------------------------------------------------- |
| `ChatPage.jsx`                   | Bouton micro, démarre/arrête l'enregistrement             |
| `useFileUpload.jsx` → `upload()` | Envoie le fichier audio via XHR avec barre de progression |
| `server/middleware/upload.js`    | Multer + Cloudinary : reçoit et stocke le fichier         |
| `server/routes/upload.js`        | Crée le message de type `'audio'` en BDD                  |
| `MessageBubble.jsx`              | Affiche `<audio controls src={...} />`                    |

### Code clé — Enregistrement (client)

```js
// Dans ChatPage.jsx, schématiquement :
const mediaRecorder = new MediaRecorder(stream);
const chunks = [];

mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
mediaRecorder.onstop = () => {
  const blob = new Blob(chunks, { type: "audio/webm" }); // Assemblage du fichier
  const file = new File([blob], "vocal.webm", { type: "audio/webm" });
  upload(file, currentRoom._id); // Envoi vers /api/upload via useFileUpload
};

mediaRecorder.start(); // Début enregistrement
// ... l'utilisateur parle ...
mediaRecorder.stop(); // Fin → déclenche onstop
```

### Code clé — Réception côté serveur

```js
// server/routes/upload.js
const mime = f.mimetype; // 'audio/webm'
let msgType = "file";
if (mime.startsWith("audio/")) msgType = "audio"; // ← détection automatique

const message = await Message.create({
  room: roomId,
  author: req.user._id,
  type: msgType, // 'audio'
  attachment: {
    secureUrl: f.path, // URL Cloudinary pour lire le fichier
    filename: f.originalname,
    bytes: f.size,
  },
});
```

---

## 3. 📎 L'envoi de fichiers (images, PDF, ZIP...)

### Trajet complet

```
Clic 📎 → <input type="file"> → onChange → upload() → XHR POST /api/upload
→ Multer intercepte → CloudinaryStorage stocke → URL retournée
→ Message créé en BDD → réponse JSON au client
→ addMessage() → MessageBubble affiche le bon composant selon le type
```

### Fichiers impliqués

| Fichier                       | Rôle                                                             |
| ----------------------------- | ---------------------------------------------------------------- |
| `useFileUpload.jsx`           | Hook + composant `<FileInput>` intégré, gère la progression XHR  |
| `server/middleware/upload.js` | Configure Multer + Cloudinary, filtre les extensions dangereuses |
| `server/routes/upload.js`     | Route `POST /api/upload`, crée le message                        |
| `MessageBubble.jsx`           | Affiche image / audio / lien téléchargement selon `msg.type`     |

### Pourquoi XHR et pas fetch ?

```js
// useFileUpload.jsx — XHR permet de suivre la progression upload
const xhr = new XMLHttpRequest();
xhr.upload.onprogress = (e) => {
  setProgress(Math.round((e.loaded / e.total) * 100)); // 0% → 100%
};
// fetch() ne supporte pas onprogress → impossible d'afficher la barre
```

### Sécurité — Extensions bloquées

```js
// server/middleware/upload.js
const blocked = [".exe", ".sh", ".bat", ".cmd", ".msi", ".dmg"];
// Ces extensions sont rejetées → impossible d'uploader un virus
```

### Limite de taille

```js
const upload = multer({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB maximum
});
```

---

## 4. 📞 Les appels audio

### Trajet complet

```
CallButton (Mic) → startCall(user, 'audio')
→ getUserMedia({ audio: true, video: false })    ← demande accès micro
→ createPeerConnection()                          ← prépare la connexion WebRTC
→ pc.createOffer() + setLocalDescription()        ← crée la description SDP
→ emit('call_offer', { sdp, callType: 'audio' }) ← envoie via WebSocket
→ WsServer handleCallOffer() → sendToUser()       ← transmet à l'autre
→ handleIncomingCall()                            ← l'autre reçoit, callState='incoming'
→ CallModal affiche "Accepter / Refuser"
→ acceptCall() → getUserMedia({ audio: true })    ← l'autre ouvre son micro
→ pc.setRemoteDescription(sdp offre)             ← enregistre l'offre
→ pc.createAnswer() + setLocalDescription()       ← crée la réponse
→ emit('call_answer', { sdp, accepted: true })    ← envoie la réponse
→ WsServer handleCallAnswer() → sendToUser()      ← transmet à l'appelant
→ handleCallAnswer() → pc.setRemoteDescription() ← connexion complète
→ flux audio P2P direct entre les deux navigateurs
```

### Fichiers impliqués

| Fichier                                               | Rôle                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| `CallButton.jsx`                                      | Deux boutons : Mic (audio) et Video                                 |
| `useWebRTC.js` → `startCall()`                        | Démarre l'appel côté appelant                                       |
| `useWebRTC.js` → `handleIncomingCall()`               | Reçoit l'appel côté receveur                                        |
| `useWebRTC.js` → `acceptCall()`                       | Accepte et complète la connexion                                    |
| `WsServer.js` → `handleCallOffer/Answer/IceCandidate` | Relais des signaux (signaling)                                      |
| `CallModal.jsx`                                       | Interface : sonnerie, boutons accepter/refuser, bouton couper micro |

### Code clé — `startCall` étapes numérotées

```js
const startCall = async (targetUser, type) => {
  const stream = await getLocalStream(type); // 1. Accès micro
  attachLocalVideo(stream); // 2. Afficher miniature (vide en audio)
  const pc = await createPeerConnection(userId); // 3. Créer RTCPeerConnection avec STUN/TURN
  const offer = await pc.createOffer(); // 4. Générer l'offre SDP
  await pc.setLocalDescription(offer); // 5. Enregistrer localement
  emit("call_offer", { sdp: offer, callType: type }); // 6. Envoyer via WebSocket
  setCallState("calling"); // 7. UI → "Appel en cours..."
};
```

---

## 5. 🎥 Les appels vidéo

### Différence avec l'appel audio

Tout est **identique** sauf une chose : `getUserMedia` demande aussi la caméra.

```js
// Appel audio :
video: false

// Appel vidéo :
video: {
  width:     { ideal: 640, max: 1280 },
  height:    { ideal: 480, max: 720 },
  frameRate: { ideal: 24, max: 30 },
  facingMode: 'user',  // Caméra frontale
}
```

### Affichage — deux balises `<video>`

```jsx
// CallModal.jsx — appel vidéo actif
<video ref={remoteVideoRef} autoPlay playsInline style={s.remoteVideo} />
// ↑ Vidéo de l'interlocuteur — plein écran

<video ref={localVideoRef} autoPlay playsInline muted style={s.localVideo} />
// ↑ Notre propre vidéo — miniature coin bas-droite (muted = pas d'écho)
```

### Pourquoi `muted` sur la vidéo locale ?

Sans `muted`, on entendrait notre propre voix dans notre propre haut-parleur → larsen / écho. `muted` coupe le son de **l'affichage** uniquement, pas l'envoi à l'autre.

### Limitation du débit (anti-freeze)

```js
// useWebRTC.js — quand la connexion est établie (state === 'connected')
if (sender.track.kind === "video") {
  params.encodings[0].maxBitrate = 500_000; // 500 kbps max
  params.encodings[0].maxFramerate = 24; // 24 fps max
}
if (sender.track.kind === "audio") {
  params.encodings[0].maxBitrate = 64_000; // 64 kbps max
}
// Sans ça → le navigateur peut envoyer 4 Mbps → sature la 4G → blocage
```

### Contrôles pendant l'appel

```js
// Couper/activer le micro
toggleMute() → localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !t.enabled)

// Couper/activer la caméra
toggleCamera() → localStreamRef.current.getVideoTracks().forEach(t => t.enabled = !t.enabled)

// t.enabled = false : la piste est silencieuse/noire mais RESTE dans la connexion
// Pas besoin de renegocier → instantané
```

---

## 6. 🔀 Les candidats ICE (ce qui permet à la vidéo de fonctionner)

C'est le mécanisme **le plus important et le plus mal compris**.

### Le problème

Alice est derrière la Freebox (IP locale : `192.168.1.5`).
Bob est derrière Orange (IP locale : `192.168.0.10`).
Ils ne peuvent pas se connecter directement car leurs IP sont privées.

### La solution ICE

```
1. STUN (Google) → "Alice, ton IP publique est 90.10.20.30 port 54321"
2. STUN (Google) → "Bob, ton IP publique est 80.5.6.7 port 12345"
3. Ces infos = "candidats ICE"
4. Alice envoie ses candidats à Bob via WebSocket (le serveur sert de messager)
5. Bob essaie de se connecter directement à Alice avec ces infos
6. Si ça marche → connexion directe P2P
7. Si ça marche pas (réseau très restrictif) → TURN sert de relais
```

### Code clé — envoi des candidats

```js
// useWebRTC.js
pc.onicecandidate = (e) => {
  if (e.candidate) {
    emit("ice_candidate", { targetUserId: targetId, candidate: e.candidate });
    // On envoie chaque adresse réseau découverte à l'autre via WebSocket
  }
};
```

### Problème de timing — `pendingCandidates`

```js
// Les candidats ICE peuvent arriver AVANT l'offre SDP
// Si on essaie de les appliquer avant → erreur

const handleIceCandidate = async ({ candidate }) => {
  if (pc?.remoteDescription) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate)); // Appliquer maintenant
  } else {
    pendingCandidatesRef.current.push(candidate); // Mettre en file d'attente
  }
};

// Plus tard, après setRemoteDescription :
const flushPendingCandidates = async () => {
  for (const c of pendingCandidatesRef.current) {
    await pc.addIceCandidate(new RTCIceCandidate(c)); // Appliquer tous en attente
  }
  pendingCandidatesRef.current = [];
};
```

---

## 7. ❓ QUESTIONS PIÈGES — Soutenance

---

### 🔴 Questions très difficiles

---

**Q : Pourquoi l'appel vidéo ne passe pas par le serveur ? N'est-ce pas un risque de sécurité ?**

> WebRTC établit une connexion **chiffrée de bout en bout** (DTLS-SRTP). Même si la vidéo passait par le serveur, elle serait illisible sans les clés. Le serveur ne sert QUE pour le signaling (échange des adresses réseau via WebSocket), jamais pour les données vidéo. C'est à la fois plus sécurisé ET plus performant.

---

**Q : Que se passe-t-il si les deux utilisateurs sont derrière des NAT stricts (ex: 4G de leur opérateur) ?**

> STUN ne suffit plus car les opérateurs mobiles bloquent les connexions P2P. Dans ce cas, le serveur TURN de Metered.ca prend le relais : il reçoit les flux des deux côtés et les retransmet. C'est moins rapide (passe par un serveur) mais ça fonctionne toujours. C'est pourquoi on intègre Metered.ca avec `fetchIceServers()`.

---

**Q : Pourquoi utiliser `XHR` et pas `fetch` pour l'upload de fichiers ?**

> `fetch()` ne supporte pas `onprogress` sur l'upload. Pour afficher une barre de progression (0% → 100%), il faut utiliser `XMLHttpRequest` qui expose `xhr.upload.onprogress`. C'est la seule raison d'utiliser l'ancienne API XHR.

---

**Q : Que se passe-t-il si Alice envoie un message dans un salon et que Bob est connecté mais dans un autre salon ?**

> Le serveur vérifie `memberState.roomId !== roomId` pour chaque utilisateur connecté. Si Bob est dans un autre salon, il reçoit un événement `room_notification` (pas `new_message`). Côté client, `ChatContext` incrémente `unreadCounts[roomId]` et affiche un badge. Bob ne voit pas le message tant qu'il ne rejoint pas le salon.

---

**Q : Pourquoi `emitRef` au lieu de passer `emit` directement à `useWebRTC` ?**

> Dépendance circulaire : `useWebRTC` est initialisé avant `useWebSocket`. À ce moment, `emit` n'existe pas encore. Si on passait `emit` directement, il serait `undefined`. `emitRef` est une ref mise à jour à chaque render : `emitRef.current = emit`. Ainsi `useWebRTC` appelle toujours `emitRef.current?.()` qui pointe vers la vraie fonction au moment de l'appel.

---

**Q : Comment les messages éphémères sont-ils supprimés ? WebSocket, cron, autre ?**

> Un service Node.js (`cleanupExpiredMessages.js`) tourne en boucle avec `setInterval` (toutes les 30 secondes par défaut, configurable via `MESSAGE_CLEANUP_INTERVAL`). Il fait `Message.deleteMany({ expiresAt: { $lt: new Date() } })`. Ce n'est pas un vrai cron mais un timer Node.js qui démarre au lancement du serveur.

---

**Q : Si le serveur WebSocket redémarre, que se passe-t-il pour les utilisateurs connectés ?**

> Les Maps `rooms`, `clients`, `onlineUsers`, `userSockets` sont en RAM. Elles sont détruites. Tous les utilisateurs sont déconnectés. Côté client, `useWebSocket` détecte le `onclose` et relance automatiquement une connexion avec backoff exponentiel (1s, 2s, 4s... max 30s). L'utilisateur se reconnecte automatiquement sans voir d'erreur.

---

### 🟡 Questions moyennes

---

**Q : Pourquoi `muted` sur la balise `<video>` locale ?**

> Pour éviter l'écho (larsen). Sans `muted`, le navigateur jouerait notre propre voix dans nos haut-parleurs, qui serait capturée par notre micro et renvoyée à l'autre. `muted` coupe uniquement la lecture locale, pas l'envoi.

---

**Q : Quelle est la différence entre `send` et `broadcast` dans WsServer ?**

> `send(ws, event, data)` envoie à **une seule connexion** WebSocket. `broadcast(roomId, event, data)` envoie à **tous les membres d'un salon**. On utilise `send` pour les réponses personnelles (ex: confirmation de connexion, signaling WebRTC). On utilise `broadcast` pour les messages de salon.

---

**Q : Pourquoi stocker les utilisateurs en ligne dans une Map `onlineUsers` avec `Set<ws>` et pas juste `ws` ?**

> Un utilisateur peut ouvrir plusieurs onglets. Chaque onglet = une connexion WebSocket différente. En stockant un `Set<ws>`, on peut envoyer les messages à tous ses onglets. Si on stockait juste un `ws`, seul le dernier onglet ouvert recevrait les messages.

---

**Q : Comment fonctionne la sonnerie d'appel entrant sans fichier audio ?**

> La sonnerie est générée **programmatiquement** par la Web Audio API dans `CallModal.jsx`. Un `OscillatorNode` crée un son à 440 Hz (La), un `GainNode` contrôle le volume avec un fade. Pas besoin de fichier MP3 — le navigateur génère le son directement.

---

**Q : Pourquoi les fichiers uploadés sont stockés sur Cloudinary et pas sur le serveur ?**

> Stockage local = problèmes : les fichiers sont perdus si le container Docker redémarre, pas scalable, pas de CDN, pas de transformation automatique d'images. Cloudinary offre : stockage permanent, URL CDN mondiale (rapide partout), compression automatique des images, et une API simple avec multer-storage-cloudinary.

---

**Q : Qu'est-ce que le SDP (Session Description Protocol) ?**

> C'est un document texte qui décrit les capacités d'un navigateur pour un appel : quels codecs audio/vidéo il supporte (H.264, VP8, Opus...), quels ports il utilise, ses préférences réseau. L'appelant envoie un SDP "offer", le receveur répond avec un SDP "answer". Une fois que les deux ont le SDP de l'autre, ils savent comment communiquer.

---

**Q : Pourquoi `iceCandidatePoolSize: 10` dans la config WebRTC ?**

> Sans cette option, la collecte des candidats ICE commence seulement quand `createOffer()` est appelé. Avec `iceCandidatePoolSize: 10`, le navigateur pré-collecte 10 candidats réseau dès la création de `RTCPeerConnection`. Ça réduit le délai d'établissement de l'appel car les candidats sont déjà prêts quand on en a besoin.

---

### 🟢 Questions faciles

---

**Q : Quelle est la différence entre un appel audio et vidéo dans le code ?**

> Une seule ligne : `video: false` vs `video: { width, height, frameRate... }` dans `getUserMedia`. Le reste du code (ICE, SDP, signaling) est identique.

---

**Q : Comment est détecté le type d'un fichier uploadé ?**

> Par le `mimetype` renvoyé par le navigateur : `image/jpeg` → type `'image'`, `audio/webm` → type `'audio'`, `application/pdf` → type `'file'`. La fonction `getResourceType()` dans `upload.js` fait cette classification.

---

**Q : Que contient un message dans MongoDB ?**

```js
{
  room:      ObjectId,   // Quel salon
  author:    ObjectId,   // Qui l'a envoyé
  content:   String,     // Texte
  type:      String,     // 'text' | 'image' | 'audio' | 'video' | 'file' | 'giphy'
  attachment: Object,    // URL Cloudinary, taille, nom...
  replyTo:   ObjectId,   // Message auquel on répond
  reactions: Array,      // Réactions emoji
  ephemeral: Boolean,    // Message qui disparaît ?
  expiresAt: Date,       // Quand il disparaît
  createdAt: Date,       // Date de création automatique
}
```

---

**Q : Comment savoir qui est en train de taper ?**

> Quand l'utilisateur tape, le client envoie `emit('typing', { isTyping: true })`. Quand il arrête (ou envoie), `emit('typing', { isTyping: false })`. Le serveur diffuse ça à tous les membres du salon. Le client ajoute/retire l'utilisateur de `typingUsers` et affiche "Alice est en train d'écrire...".
