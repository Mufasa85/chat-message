# 📖 README — Vue d'ensemble du Projet Arcane Chat

## C'est quoi ce projet ?

Arcane Chat est une **application de messagerie en temps réel** — comme Discord ou WhatsApp — que tu peux utiliser dans un navigateur web sur téléphone ou ordinateur.

Les utilisateurs peuvent :
- Se connecter avec un pseudo et un mot de passe
- Rejoindre des **salons de groupe** (comme des canaux Discord)
- S'envoyer des **messages privés** (DM = Direct Message)
- Envoyer des **images, fichiers, GIFs, messages vocaux**
- Faire des **appels vidéo et audio** en direct
- Voir qui est en ligne, qui est en train de taper...

---

## 🏗️ Architecture générale — Comment tout s'assemble

```
┌─────────────────────────────────────────────────────────┐
│                    NAVIGATEUR (Mobile/PC)                │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │            React (Interface utilisateur)         │   │
│  │  Pages: Auth / Chat / DM / Profile / Admin       │   │
│  └──────────────┬──────────────────────┬────────────┘   │
│                 │ HTTP (REST API)       │ WebSocket      │
└─────────────────┼──────────────────────┼────────────────┘
                  │                      │
┌─────────────────▼──────────────────────▼────────────────┐
│                  SERVEUR Node.js (backend)                │
│                                                         │
│  ┌──────────────────┐    ┌──────────────────────────┐   │
│  │  API REST Express│    │  Serveur WebSocket        │   │
│  │  /api/auth       │    │  ws://...                 │   │
│  │  /api/rooms      │    │  Temps réel               │   │
│  │  /api/upload     │    │                           │   │
│  └──────────┬───────┘    └──────────────────────────┘   │
└─────────────┼───────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────┐
│                   MongoDB (Base de données)               │
│   Collections: users / rooms / messages / dms            │
└─────────────────────────────────────────────────────────┘
```

Il y a **deux façons** dont le client (navigateur) parle au serveur :

1. **HTTP REST** — pour tout ce qui ne nécessite pas le temps réel (connexion, créer une room, uploader un fichier...)
2. **WebSocket** — pour tout ce qui doit être instantané (messages, indicateur de frappe, appels vidéo...)

---

## 📁 Structure des dossiers

```
chat-app/
│
├── client/                   ← Le frontend (ce que voit l'utilisateur)
│   ├── src/
│   │   ├── main.jsx          ← Point d'entrée : démarre React
│   │   ├── App.jsx           ← Routeur principal (Auth ou Chat ?)
│   │   ├── context/          ← Données partagées entre tous les composants
│   │   │   ├── AuthContext.jsx   ← Gère la connexion/déconnexion
│   │   │   └── ChatContext.jsx   ← Gère tout le chat (messages, salons...)
│   │   ├── hooks/            ← Logique réutilisable
│   │   │   ├── useWebSocket.js   ← Connexion WebSocket
│   │   │   ├── useWebRTC.js      ← Appels vidéo/audio
│   │   │   ├── useFileUpload.jsx ← Upload de fichiers
│   │   │   └── useScreenShare.js ← Partage d'écran
│   │   └── pages/            ← Les "écrans" de l'application
│   │       ├── AuthPage.jsx      ← Page de connexion/inscription
│   │       ├── ChatPage.jsx      ← Salon de groupe (écran principal)
│   │       ├── DMPage.jsx        ← Messages privés
│   │       ├── ProfilePage.jsx   ← Profil utilisateur
│   │       └── AdminPage.jsx     ← Panneau d'administration
│   └── components/           ← Petits blocs réutilisables
│       ├── MessageBubble.jsx     ← Une bulle de message
│       ├── CallModal.jsx         ← Fenêtre d'appel vidéo
│       ├── GiphyPicker.jsx       ← Sélecteur de GIF
│       └── ...
│
├── server/                   ← Le backend (ce qui tourne côté serveur)
│   ├── index.js              ← Point d'entrée : démarre le serveur
│   ├── routes/               ← Les "chemins" de l'API
│   │   ├── auth.js           ← /api/auth/login, /api/auth/register
│   │   ├── rooms.js          ← /api/rooms, /api/rooms/:id/messages
│   │   ├── upload.js         ← /api/upload (images, audio, fichiers)
│   │   ├── users.js          ← /api/users
│   │   └── dm.js             ← /api/dm (messages privés)
│   ├── models/               ← La forme des données en base
│   │   ├── User.js           ← Schéma utilisateur
│   │   ├── Room.js           ← Schéma salon
│   │   ├── Message.js        ← Schéma message de groupe
│   │   └── DM.js             ← Schéma message privé
│   ├── websocket/
│   │   └── WsServer.js       ← Toute la logique temps réel
│   ├── middleware/
│   │   ├── auth.js           ← Vérifie le token JWT
│   │   └── upload.js         ← Config Cloudinary (stockage fichiers)
│   └── services/
│       └── cleanupService.js ← Supprime les messages expirés
│
└── docker-compose.yml        ← Lance tout avec Docker
```

---

## 🔄 Cycle de vie d'un message — Du clic au destinataire

Voici ce qui se passe quand tu tapes "Bonjour" et appuies sur Entrée :

```
1. Tu appuies sur Entrée dans ChatPage.jsx
        ↓
2. sendMessage() est appelée dans ChatContext.jsx
        ↓
3. emit('send_message', { roomId, content }) envoie via WebSocket
        ↓
4. Le serveur (WsServer.js) reçoit l'événement 'send_message'
        ↓
5. Le serveur sauvegarde le message dans MongoDB
        ↓
6. Le serveur diffuse ('broadcast') à TOUS les membres du salon
   via l'événement 'new_message'
        ↓
7. Chaque navigateur connecté reçoit 'new_message'
        ↓
8. ChatContext.jsx ajoute le message à la liste : setMessages([...prev, data])
        ↓
9. React re-render → le message apparaît dans l'interface
```

---

## 🔐 Comment fonctionne la connexion (JWT)

JWT = JSON Web Token. C'est comme un **badge d'accès** numérique.

```
1. Tu entres pseudo + mot de passe
        ↓
2. AuthPage envoie POST /api/auth/login au serveur
        ↓
3. Le serveur vérifie le mot de passe (bcrypt)
        ↓
4. Si OK → le serveur génère un TOKEN (une longue chaîne chiffrée)
   et le renvoie : { token: "eyJhbG...", user: { ... } }
        ↓
5. AuthContext sauvegarde le token dans localStorage
   (il reste même si tu fermes le navigateur)
        ↓
6. Pour chaque requête suivante, le token est envoyé dans le header :
   Authorization: "Bearer eyJhbG..."
        ↓
7. Le middleware auth.js sur le serveur vérifie le token
   Si valide → laisse passer. Si invalide → 401 Unauthorized.
```

---

## ☁️ Services externes utilisés

| Service | Rôle | Gratuit ? |
|---|---|---|
| **MongoDB Atlas** | Base de données dans le cloud | ✅ (512MB) |
| **Cloudinary** | Stockage images/audio/vidéo | ✅ (25GB) |
| **Metered.ca** | Serveur TURN pour appels vidéo | ✅ (limité) |
| **Giphy API** | Recherche et envoi de GIFs | ✅ |
| **Vercel** | Hébergement du frontend React | ✅ |
| **Render** | Hébergement du backend Node.js | ✅ |

---

## 🚀 Comment lancer le projet localement

### Option 1 — Sans Docker (développement)

```bash
# Terminal 1 : lancer le backend
cd server
npm install
node index.js

# Terminal 2 : lancer le frontend
cd client
npm install
npm run dev
```

Puis ouvrir `http://localhost:5173`

### Option 2 — Avec Docker (production)

```bash
# Créer le fichier server/.env.docker avec tes credentials
# Créer le fichier .env à la racine avec VITE_METERED_API_KEY

docker compose build
docker compose up -d
```

Puis ouvrir `http://localhost`

---

## 🗃️ Les données stockées en base (MongoDB)

### Collection `users`
```js
{
  username: "Alice",
  password: "$2b$10$...",  // hash bcrypt, jamais en clair
  avatar: "https://cloudinary.com/...",
  role: "user",            // ou "admin"
  createdAt: "2024-01-01"
}
```

### Collection `rooms`
```js
{
  name: "général",
  description: "Salon principal",
  createdBy: ObjectId("..."),
  createdAt: "2024-01-01"
}
```

### Collection `messages`
```js
{
  room: ObjectId("..."),        // quel salon
  author: ObjectId("..."),      // qui a écrit
  content: "Bonjour !",
  type: "text",                 // text | image | audio | video | file | giphy
  attachment: { url: "...", secureUrl: "...", filename: "..." },
  replyTo: ObjectId("..."),     // réponse à quel message
  reactions: { "👍": ["userId1", "userId2"] },
  ephemeral: false,             // message qui disparaît ?
  ttl: 300,                     // durée de vie en secondes
  createdAt: "2024-01-01T12:00"
}
```

### Collection `dms`
```js
{
  from: ObjectId("..."),    // expéditeur
  to: ObjectId("..."),      // destinataire
  content: "Salut !",
  type: "text",
  attachment: { ... },
  createdAt: "2024-01-01T12:00"
}
Sur WebSocket :
"Le WebSocket maintient une connexion permanente. Quand un message est envoyé, le serveur le diffuse à tous les membres du salon via broadcast(). Le hook useWebSocket.js gère la reconnexion automatique avec un délai exponentiel."

Sur WebRTC :

"WebRTC permet la vidéo directe entre navigateurs sans passer par le serveur. Le serveur sert uniquement de 'messager' pour l'échange initial (signaling). Le TURN de Metered.ca sert de relais quand une connexion directe est impossible (réseaux différents)."

Sur React :

"ChatContext centralise tout l'état de l'application. Les composants consomment le contexte via useChat() sans avoir besoin de se passer les données en cascade."
```
