# 📞 Système d'Appels Audio & Vidéo — Documentation Technique

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture](#architecture)
3. [Technologies utilisées](#technologies-utilisées)
4. [Flux d'un appel complet](#flux-dun-appel-complet)
5. [Fichiers impliqués](#fichiers-impliqués)
6. [Détail des composants](#détail-des-composants)
7. [Signaling WebSocket (serveur)](#signaling-websocket-serveur)
8. [Hook useWebRTC (client)](#hook-usewebrtc-client)
9. [Interface utilisateur](#interface-utilisateur)
10. [Configuration STUN / TURN](#configuration-stun--turn)
11. [Modes de déploiement (HTTPS)](#modes-de-déploiement-https)
12. [Diagrammes de séquence](#diagrammes-de-séquence)

---

## Vue d'ensemble

Le système implémente des **appels audio et vidéo en temps réel** entre deux utilisateurs
connectés au chat. La communication est **peer-to-peer** (P2P) via **WebRTC**, avec un
serveur WebSocket qui sert uniquement de **relai de signaling** pour négocier la connexion.

Une fois la connexion P2P établie, l'audio et la vidéo transitent **directement entre les
navigateurs** sans passer par le serveur.

### Caractéristiques

- Appels audio (micro uniquement) et vidéo (micro + caméra)
- Sonnerie d'appel entrant (générée par Web Audio API)
- Contrôles : couper le micro, couper la caméra, raccrocher
- Gestion complète du cycle de vie : appel → sonnerie → acceptation/refus → actif → raccrochage
- Compatible PC et mobile (HTTPS requis pour mobile)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        NAVIGATEUR A                              │
│                                                                  │
│  ChatPage.jsx                                                    │
│    ├── CallButton.jsx  → clic 🎙 ou 📹 → startCall()           │
│    └── CallModal.jsx   → affiche l'interface d'appel             │
│                                                                  │
│  ChatContext.jsx                                                 │
│    └── useWebRTC.js    → gère RTCPeerConnection + MediaStream    │
│            │                                                     │
│            │ WebSocket (signaling)                                │
│            ▼                                                     │
│ ┌──────────────────────────────────────────────────────────┐     │
│ │              SERVEUR NODE.JS (WsServer.js)               │     │
│ │  Relaie : call_offer, call_answer, ice_candidate,        │     │
│ │           call_end entre les deux clients                 │     │
│ └──────────────────────────────────────────────────────────┘     │
│            │                                                     │
│            │ WebSocket (signaling)                                │
│            ▼                                                     │
│  ChatContext.jsx                                                 │
│    └── useWebRTC.js    → gère RTCPeerConnection + MediaStream    │
│                                                                  │
│  ChatPage.jsx                                                    │
│    └── CallModal.jsx   → affiche l'interface d'appel             │
│                                                                  │
│                        NAVIGATEUR B                              │
└──────────────────────────────────────────────────────────────────┘

                   ┌─────────────────────┐
                   │   Flux audio/vidéo  │
                   │   DIRECT (P2P)      │
                   │   via WebRTC        │
                   │   A ◄──────────► B  │
                   └─────────────────────┘
```

---

## Technologies utilisées

| Technologie                      | Rôle                                                            |
| -------------------------------- | --------------------------------------------------------------- |
| **WebRTC** (`RTCPeerConnection`) | Connexion P2P audio/vidéo entre navigateurs                     |
| **getUserMedia**                 | Accès au microphone et à la caméra                              |
| **WebSocket** (`ws`)             | Transport du signaling (offre SDP, réponse SDP, ICE candidates) |
| **STUN** (Google)                | Découverte de l'IP publique pour traverser le NAT               |
| **TURN** (Metered.ca)            | Relai de secours quand la connexion P2P directe est impossible  |
| **React Hooks**                  | Gestion d'état et cycle de vie du composant                     |
| **Web Audio API**                | Génération de la sonnerie d'appel entrant                       |

---

## Flux d'un appel complet

### 1. Initiation de l'appel (Appelant — Alice)

```
Alice clique 🎙 (audio) ou 📹 (vidéo)
    │
    ├── CallButton.jsx appelle onCall(user, 'audio')
    │       ↓
    ├── useWebRTC.startCall(targetUser, type)
    │       │
    │       ├── getUserMedia({ audio: true, video: type === 'video' })
    │       │       → obtient le MediaStream local (micro + caméra si vidéo)
    │       │
    │       ├── Crée RTCPeerConnection avec serveurs STUN/TURN
    │       │       → attache les tracks locaux au PC
    │       │       → configure onicecandidate (envoie les ICE candidates)
    │       │       → configure ontrack (reçoit le flux distant)
    │       │
    │       ├── createOffer() → setLocalDescription(offer)
    │       │       → génère l'offre SDP (description des codecs, formats)
    │       │
    │       └── emit('call_offer', { targetUserId, sdp, callType })
    │               → envoie l'offre au serveur via WebSocket
    │
    └── callState passe à 'calling' → CallModal affiche "Appel en cours..."
```

### 2. Réception de l'appel (Appelé — Bob)

```
Serveur reçoit 'call_offer' de Alice
    │
    ├── WsServer.js : handleCallOffer()
    │       → trouve le WebSocket de Bob dans userSockets
    │       → envoie 'incoming_call' à Bob
    │
    ▼
Bob reçoit 'incoming_call' via WebSocket
    │
    ├── ChatContext.jsx route vers webrtcRef.current.handleIncomingCall(data)
    │
    ├── useWebRTC.handleIncomingCall({ callerId, callerName, sdp, callType })
    │       → stocke les données dans pendingCallRef (PAS de réponse auto)
    │       → callState passe à 'incoming'
    │
    └── CallModal affiche "📞 Appel audio/vidéo entrant de Alice"
            → Sonnerie (Web Audio API oscillateur 440Hz)
            → Boutons [✅ Accepter] [❌ Refuser]
```

### 3. Acceptation de l'appel

```
Bob clique [✅ Accepter]
    │
    ├── useWebRTC.acceptCall()
    │       │
    │       ├── getUserMedia() → obtient le flux local de Bob
    │       │
    │       ├── Crée RTCPeerConnection
    │       │       → attache tracks locaux
    │       │
    │       ├── setRemoteDescription(offer SDP d'Alice)
    │       │       → applique les ICE candidates en attente (flushPendingCandidates)
    │       │
    │       ├── createAnswer() → setLocalDescription(answer)
    │       │
    │       └── emit('call_answer', { targetUserId, sdp, accepted: true })
    │
    └── callState passe à 'active'
```

### 4. Connexion établie

```
Alice reçoit 'call_answer' via WebSocket
    │
    ├── useWebRTC.handleCallAnswer({ sdp, accepted: true })
    │       │
    │       ├── setRemoteDescription(answer SDP de Bob)
    │       │       → applique les ICE candidates en attente
    │       │
    │       └── callState passe à 'active'
    │
    ▼
Les deux navigateurs échangent des ICE candidates
    │
    ├── pc.onicecandidate → emit('ice_candidate', { candidate })
    │       → Serveur relaie vers l'autre pair
    │
    ├── handleIceCandidate({ candidate })
    │       → pc.addIceCandidate() si remoteDescription déjà set
    │       → sinon, mis en file d'attente dans pendingCandidatesRef
    │
    ▼
Connexion P2P établie → Audio/Vidéo en direct
    │
    ├── pc.ontrack → attachRemoteStream(stream)
    │       → remoteAudioRef.srcObject = stream  (pour l'audio)
    │       → remoteVideoRef.srcObject = stream  (pour la vidéo)
    │
    └── Les deux utilisateurs s'entendent et/ou se voient
```

### 5. Raccrochage

```
Alice (ou Bob) clique [📵 Raccrocher]
    │
    ├── useWebRTC.hangUp()
    │       ├── emit('call_end', { targetUserId, reason: 'hangup' })
    │       └── cleanup()
    │               ├── Stop tous les tracks du MediaStream local
    │               ├── Ferme le RTCPeerConnection
    │               ├── Réinitialise toutes les refs et l'état
    │               └── callState → 'idle' → CallModal disparaît
    │
    ▼
L'autre pair reçoit 'call_end'
    │
    └── handleCallEnd() → cleanup() → callState → 'idle'
```

### 6. Refus de l'appel

```
Bob clique [❌ Refuser]
    │
    ├── useWebRTC.rejectCall()
    │       ├── emit('call_answer', { accepted: false })
    │       └── cleanup() → callState → 'idle'
    │
    ▼
Alice reçoit 'call_answer' avec accepted: false
    └── cleanup() → callState → 'idle'
```

---

## Fichiers impliqués

### Client

| Fichier                              | Rôle                                                  |
| ------------------------------------ | ----------------------------------------------------- |
| `client/src/hooks/useWebRTC.js`      | **Hook principal** — gère tout le cycle de vie WebRTC |
| `client/components/CallModal.jsx`    | **Interface d'appel** — affiche les différents états  |
| `client/components/CallButton.jsx`   | **Boutons d'appel** — 🎙 audio et 📹 vidéo             |
| `client/src/context/ChatContext.jsx` | **Routing** — connecte le WebSocket au hook WebRTC    |
| `client/src/pages/ChatPage.jsx`      | **Page principale** — monte CallModal et CallButton   |

### Serveur

| Fichier                        | Rôle                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `server/websocket/WsServer.js` | **Signaling** — relaie les messages WebRTC entre les clients |

---

## Détail des composants

### `useWebRTC.js` — Hook principal

#### États exposés

| État           | Type                                            | Description                      |
| -------------- | ----------------------------------------------- | -------------------------------- |
| `callState`    | `'idle' \| 'calling' \| 'incoming' \| 'active'` | Phase actuelle de l'appel        |
| `callType`     | `'audio' \| 'video' \| null`                    | Type d'appel en cours            |
| `remoteUser`   | `{ username, avatar }`                          | Informations sur l'interlocuteur |
| `isMuted`      | `boolean`                                       | Micro coupé ou non               |
| `isCamOff`     | `boolean`                                       | Caméra coupée ou non             |
| `remoteStream` | `MediaStream \| null`                           | Flux audio/vidéo distant         |

#### Refs exposées

| Ref               | Type                                | Description                                       |
| ----------------- | ----------------------------------- | ------------------------------------------------- |
| `localVideoRef`   | `React.RefObject<HTMLVideoElement>` | Élément `<video>` pour la prévisualisation locale |
| `remoteVideoRef`  | `React.RefObject<HTMLVideoElement>` | Élément `<video>` pour la vidéo distante          |
| `remoteAudioRef`  | `React.RefObject<HTMLAudioElement>` | Élément `<audio>` pour l'audio distant            |
| `remoteStreamRef` | `React.RefObject<MediaStream>`      | Ref vers le stream distant                        |

#### Méthodes — Actions utilisateur

| Méthode                       | Paramètres                                               | Description                          |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------ |
| `startCall(targetUser, type)` | `targetUser`: objet user, `type`: `'audio'` ou `'video'` | Démarre un appel vers un utilisateur |
| `acceptCall()`                | —                                                        | Accepte l'appel entrant              |
| `rejectCall()`                | —                                                        | Refuse l'appel entrant               |
| `hangUp()`                    | —                                                        | Raccroche l'appel en cours           |
| `toggleMute()`                | —                                                        | Coupe/active le micro                |
| `toggleCamera()`              | —                                                        | Coupe/active la caméra               |

#### Méthodes — Handlers WebSocket (appelées par ChatContext)

| Méthode                    | Événement WS    | Description                              |
| -------------------------- | --------------- | ---------------------------------------- |
| `handleIncomingCall(data)` | `incoming_call` | Reçoit une offre d'appel entrant         |
| `handleCallAnswer(data)`   | `call_answer`   | Reçoit la réponse (accepté/refusé + SDP) |
| `handleIceCandidate(data)` | `ice_candidate` | Reçoit un ICE candidate du pair          |
| `handleCallEnd(data)`      | `call_end`      | L'autre pair a raccroché                 |

#### Fonctions internes

| Fonction                         | Description                                                            |
| -------------------------------- | ---------------------------------------------------------------------- |
| `getLocalStream(type)`           | Appelle `getUserMedia()` pour obtenir le flux micro (+caméra si vidéo) |
| `attachLocalVideo(stream)`       | Attache le flux local à `localVideoRef`                                |
| `attachRemoteStream(stream)`     | Attache le flux distant à `remoteVideoRef` et `remoteAudioRef`         |
| `createPeerConnection(targetId)` | Crée le `RTCPeerConnection` avec STUN/TURN, attache les tracks         |
| `cleanup()`                      | Stoppe les tracks, ferme le PC, réinitialise tout l'état               |
| `flushPendingCandidates()`       | Applique les ICE candidates reçus avant le `setRemoteDescription`      |

---

### `CallModal.jsx` — Interface d'appel

Affiche un overlay plein écran selon `callState` :

| État               | Affichage                                                                  |
| ------------------ | -------------------------------------------------------------------------- |
| `idle`             | Rien (return null)                                                         |
| `calling`          | Avatar + "Appel en cours..." + bouton raccrocher                           |
| `incoming`         | Avatar + "📞 Appel entrant" + sonnerie + boutons accepter/refuser          |
| `active` + `audio` | Avatar + "🎙 Appel audio actif" + boutons mute/raccrocher + `<audio>` caché |
| `active` + `video` | Vidéo distante plein écran + vidéo locale (petit coin) + contrôles         |

#### Sonnerie (`useRingtone`)

Hook interne qui génère un bip à 440Hz toutes les 2 secondes via l'**API Web Audio** :

- Crée un `AudioContext` + `OscillatorNode` + `GainNode`
- Joue un son court (0.6s) avec décroissance exponentielle
- S'active quand `callState === 'incoming'`
- Se stoppe quand l'état change

#### Ré-attachement du stream

Un `useEffect` surveille `callState` et `remoteStream` pour ré-attacher le stream distant
aux éléments `<audio>` et `<video>` après leur montage dans le DOM (car `ontrack` peut
arriver avant que React ait rendu le composant).

---

### `CallButton.jsx` — Boutons d'appel

Deux boutons simples affichés à côté du nom d'un utilisateur en ligne :

- 🎙 → `onCall(user, 'audio')`
- 📹 → `onCall(user, 'video')`

`onCall` est lié à `webrtc.startCall` dans `ChatPage.jsx`.

---

### `ChatContext.jsx` — Routing WebSocket → WebRTC

Le context route les événements WebSocket entrants vers les handlers du hook :

```javascript
case 'incoming_call':
    webrtcRef.current.handleIncomingCall(data);
    break;
case 'call_answer':
    webrtcRef.current.handleCallAnswer(data);
    break;
case 'ice_candidate':
    webrtcRef.current.handleIceCandidate(data);
    break;
case 'call_end':
    webrtcRef.current.handleCallEnd(data);
    break;
```

`webrtcRef` est une ref qui pointe toujours vers la dernière instance du hook `useWebRTC`,
ce qui évite les problèmes de closure stale dans le callback `onMessage`.

---

## Signaling WebSocket (serveur)

### `WsServer.js` — Handlers de signaling

Le serveur ne fait **aucun traitement** sur les données WebRTC. Il relaie simplement les
messages entre les deux clients via `userSockets` (Map userId → WebSocket).

| Événement reçu  | Handler                | Action                                  | Événement émis  |
| --------------- | ---------------------- | --------------------------------------- | --------------- |
| `call_offer`    | `handleCallOffer()`    | Relaie l'offre SDP vers le destinataire | `incoming_call` |
| `call_answer`   | `handleCallAnswer()`   | Relaie la réponse SDP vers l'appelant   | `call_answer`   |
| `ice_candidate` | `handleIceCandidate()` | Relaie le candidate ICE                 | `ice_candidate` |
| `call_end`      | `handleCallEnd()`      | Relaie le signal de fin                 | `call_end`      |

### Données transmises

#### `call_offer` → `incoming_call`

```json
{
  "callerId": "64a3...",
  "callerName": "Alice",
  "callerAvatar": "#6366f1",
  "sdp": { "type": "offer", "sdp": "v=0\r\no=- ..." },
  "callType": "audio"
}
```

#### `call_answer`

```json
{
  "calleeId": "64b5...",
  "calleeName": "Bob",
  "sdp": { "type": "answer", "sdp": "v=0\r\no=- ..." },
  "accepted": true
}
```

#### `ice_candidate`

```json
{
  "fromUserId": "64a3...",
  "candidate": {
    "candidate": "candidate:1 1 UDP ...",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```

#### `call_end`

```json
{
  "fromUserId": "64a3...",
  "reason": "hangup"
}
```

---

## Configuration STUN / TURN

### Pourquoi STUN et TURN ?

La plupart des appareils sont derrière un **NAT** (routeur WiFi, réseau mobile). WebRTC a
besoin de connaître l'adresse IP publique de chaque pair pour établir la connexion P2P.

| Protocole | Rôle                                              | Quand utilisé                                      |
| --------- | ------------------------------------------------- | -------------------------------------------------- |
| **STUN**  | Découvre l'IP publique du pair                    | Toujours (première étape)                          |
| **TURN**  | **Relaie** le flux si la connexion directe échoue | NAT symétriques, pare-feu stricts, réseaux mobiles |

### Configuration actuelle

Définie dans `useWebRTC.js` via les variables d'environnement :

```env
VITE_TURN_URL=global.relay.metered.ca:80
VITE_TURN_USERNAME=abc123
VITE_TURN_PASSWORD=def456
```

Les serveurs STUN Google sont utilisés par défaut (gratuits, illimités) :

- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`
- `stun:stun2.l.google.com:19302`

### Obtenir des credentials TURN

1. Créer un compte gratuit sur [Metered.ca](https://dashboard.metered.ca/signup)
2. Créer une application → section "TURN Credentials"
3. Renseigner les 3 variables dans `.env` (local) et dans Vercel (production)

> ⚠️ **Sans TURN fiable**, les appels en production (Render + Vercel) auront de l'audio
> brouillé ou ne se connecteront pas du tout quand les pairs sont sur des réseaux différents.

---

## Modes de déploiement (HTTPS)

`getUserMedia()` (accès micro/caméra) nécessite un **contexte sécurisé** (HTTPS ou localhost).

### Mode développement local (PC uniquement)

```env
VITE_WS_URL=ws://10.173.193.120:3001/ws
VITE_API_URL=http://10.173.193.120:3001/api
```

- ✅ Fonctionne sur le même réseau WiFi entre PCs
- ❌ Ne fonctionne pas sur mobile (HTTP bloque getUserMedia)

### Mode Cloudflare Tunnel (mobile + réseau externe)

```env
VITE_WS_URL=wss://xxx.trycloudflare.com/ws
VITE_API_URL=https://xxx.trycloudflare.com/api
```

- ✅ HTTPS automatique → micro/caméra autorisés partout
- ✅ Accessible depuis n'importe quel réseau
- ⚠️ URLs temporaires qui changent à chaque redémarrage du tunnel

### Mode production (Render + Vercel)

- Le front est déployé sur **Vercel** → HTTPS natif
- Le back est déployé sur **Render** → HTTPS natif
- ✅ Tout fonctionne nativement sans configuration supplémentaire
- ⚠️ Nécessite un serveur TURN fiable (Metered.ca)

---

## Diagrammes de séquence

### Appel audio accepté

```
  Alice (appelant)          Serveur WS           Bob (appelé)
       │                        │                      │
       │── call_offer ─────────►│                      │
       │   (sdp offer)          │── incoming_call ────►│
       │                        │   (sdp + callerInfo) │
       │                        │                      │ sonnerie 🔔
       │                        │                      │
       │                        │◄── call_answer ──────│ (clique ✅)
       │◄── call_answer ───────│    (sdp answer)       │
       │                        │                      │
       │── ice_candidate ──────►│── ice_candidate ────►│
       │◄── ice_candidate ─────│◄── ice_candidate ────│
       │        ...             │        ...           │
       │                        │                      │
       │◄═══════════ Connexion P2P établie ═══════════►│
       │         Audio direct (pas via serveur)        │
       │                        │                      │
       │── call_end ───────────►│── call_end ─────────►│
       │                        │                      │
```

### Appel vidéo refusé

```
  Alice (appelant)          Serveur WS           Bob (appelé)
       │                        │                      │
       │── call_offer ─────────►│                      │
       │   (callType: video)    │── incoming_call ────►│
       │                        │                      │ sonnerie 🔔
       │                        │                      │
       │                        │◄── call_answer ──────│ (clique ❌)
       │◄── call_answer ───────│    (accepted: false)  │
       │                        │                      │
       │   cleanup() + idle     │                      │  cleanup() + idle
```

---

## Résumé des états de l'appel

```
                    startCall()
         ┌──────── IDLE ────────┐
         │                      │
         │                      ▼
         │                   CALLING ──── refusé ──► IDLE
         │                      │
         │                   accepté
         │                      │
         │    acceptCall()      ▼
    INCOMING ──────────────► ACTIVE
         │                      │
     rejectCall()           hangUp()
         │                      │
         ▼                      ▼
       IDLE                   IDLE
```
