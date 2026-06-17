# ArcaneCore Messenger - Chat en Temps Réel avec Messages Éphémères

## 📋 Table des Matières

1. [Aperçu du Projet](#aperçu-du-projet)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Fonctionnalités](#fonctionnalités)
5. [Messages Éphémères - Détails](#messages-éphémères---détails)
6. [Structure des Fichiers](#structure-des-fichiers)
7. [Configuration](#configuration)
8. [API & WebSocket](#api--websocket)
9. [Base de Données](#base-de-données)

---

## 🔍 Aperçu du Projet

**ArcaneCore Messenger** est une application de chat en temps réel inspirée de Discord, construite avec :
- **Frontend** : React + Vite + TailwindCSS
- **Backend** : Node.js + Express
- **Base de données** : MongoDB
- **Communication** : WebSocket (Socket.io)
- **Authentification** : JWT

### 🎯 Objectif Principal
Permettre aux utilisateurs de communiquer en temps réel via des salons de discussion, avec une fonctionnalité unique de **messages éphémères** qui s'auto-suppriment après un temps défini.

---

## 🏗️ Architecture

```
chat-app/
├── client/                    # Frontend React
│   ├── src/
│   │   ├── components/        # Composants réutilisables
│   │   ├── context/           # Contextes React (Auth, Chat)
│   │   ├── hooks/             # Hooks personnalisés
│   │   ├── pages/             # Pages de l'application
│   │   └── App.jsx            # Composant principal
│   ├── .env                   # Variables d'environnement client
│   └── package.json
│
├── server/                    # Backend Node.js
│   ├── models/                # Modèles MongoDB (User, Message, Room)
│   ├── routes/                # Routes API REST
│   ├── middleware/            # Middlewares (auth, etc.)
│   ├── services/              # Services (cleanup messages)
│   ├── websocket/             # Logique WebSocket
│   ├── index.js               # Point d'entrée serveur
│   └── .env                   # Variables d'environnement serveur
│
├── package.json               # Script de setup
└── README.md
```

---

## ⚙️ Installation

### 1. Prérequis
- Node.js v18+
- MongoDB (local ou Atlas)
- Git

### 2. Installation automatique
```bash
# Cloner le projet
git clone https://github.com/Mufasa85/chat-message.git
cd chat-app

# Lancer le setup (installe les dépendances et configure)
npm run setup
# OU
bash setup.sh
```

### 3. Installation manuelle
```bash
# Installer les dépendances serveur
cd server
npm install

# Installer les dépendances client
cd ../client
npm install

# Configurer les fichiers .env
cp server/.env.example server/.env
cp client/.env.example client/.env  # si disponible
```

### 4. Lancer l'application
```bash
# Terminal 1 - Serveur (port 3001)
cd server
npm run dev

# Terminal 2 - Client (port 5173)
cd client
npm run dev
```

---

## ✨ Fonctionnalités

### 🔐 Authentification
- Inscription / Connexion
- JWT token pour la sécurité
- Sessions persistantes

### 💬 Salons de Discussion
- Création de salons textuels
- Liste des salons disponibles
- Rejoindre/quitter un salon

### 📡 Chat en Temps Réel
- Messages instantanés via WebSocket
- Indicateur "en train de taper"
- Liste des utilisateurs en ligne
- Messages persistants en base de données

### ⏱️ Messages Éphémères (⭐ Fonctionnalité Principale)
- Définir une durée de vie pour un message
- Auto-suppression après expiration
- Configurable par l'administrateur

### 🎨 Interface
- Design style Discord
- Responsive
- Thème sombre

---

## ⏱️ Messages Éphémères - Détails

### 🎯 Rôle

Les **messages éphémères** sont des messages temporaires qui :
1. Existent en base de données pendant une durée définie
2. Sont automatiquement supprimés après expiration
3. Permettent de partager des informations à court terme (codes, liens temporaires, etc.)

### 🔧 Comment ça Marche

#### Côté Client (`client/src/pages/ChatPage.jsx`)

```
┌─────────────────────────────────────────────────────────┐
│  Barre de message                                       │
│  ┌──────┐  ┌────────────────────────────┐  ┌───────┐  │
│  │ ⏱️  │   │ Tapez votre message...    │   │  Env │  │
│  └──────┘  └────────────────────────────┘  └───────┘  │
└─────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│  Menu des durées (au clic sur ⏱️)                      │
│  ┌─────────────────────────────┐                        │
│  │ Durée                       │                        │
│  ├─────────────────────────────┤                        │
│  │ 10 sec                      │                        │
│  │ 30 sec                      │                        │
│  │ 1 min                       │                        │
│  │ 2 min                       │  ← Sélection          │
│  │ 5 min                       │                        │
│  └─────────────────────────────┘                        │
└─────────────────────────────────────────────────────────┘
```

**Logique :**
1. L'utilisateur clique sur le bouton ⏱️
2. Sélectionne une durée (10s, 30s, 1min, 2min, 5min)
3. Envoie le message
4. Le message est marqué comme éphémère avec un TTL

#### Côté Serveur

**1. Réception du message** (`server/websocket/WsServer.js`)
```javascript
// Quand un message éphémère est reçu
{
  type: 'message',
  content: 'Mon message secret',
  ephemeral: true,     // ← Drapeau éphémère
  ttl: 30             // ← Time To Live en secondes
}
```

**2. Stockage en base** (`server/models/Message.js`)
```javascript
{
  content: 'Mon message secret',
  author: ObjectId('...'),
  room: ObjectId('...'),
  ephemeral: true,           // ← Champ éphémère
  ttl: 30,                  // ← Durée en secondes
  createdAt: Date.now(),
  expiresAt: Date.now() + 30000  // ← Calculé automatiquement
}
```

**3. Nettoyage automatique** (`server/services/cleanupExpiredMessages.js`)
```javascript
// Ce service s'exécute toutes les 30 secondes
async function cleanupExpiredMessages() {
  // Supprime tous les messages où expiresAt < maintenant
  await Message.deleteMany({
    ephemeral: true,
    expiresAt: { $lt: new Date() }
  });
}
```

### 📁 Fichiers Clés

| Fichier | Rôle |
|---------|------|
| `client/src/pages/ChatPage.jsx` | Interface du chat, bouton éphémère |
| `client/.env` | Configuration des durées (VITE_EPHEMERAL_*) |
| `server/models/Message.js` | Schéma du message avec champs éphémères |
| `server/services/cleanupExpiredMessages.js` | Service de nettoyage automatique |
| `server/websocket/WsServer.js` | Gestion WebSocket des messages |
| `server/index.js` | Intégration du service de cleanup |

### ⚙️ Configuration des Durées

Les durées sont configurables via `client/.env` :

```env
# Valeurs en secondes
VITE_EPHEMERAL_DURATIONS=10,30,60,120,300

# Labels affichés (dans le même ordre)
VITE_EPHEMERAL_LABELS=10 sec,30 sec,1 min,2 min,5 min
```

**Pour ajouter/modifier :**
1. Éditez `client/.env`
2. Redémarrez le client
3. Les nouvelles durées apparaissent dans le menu

---

## 📂 Structure des Fichiers

### Frontend (`client/`)

| Fichier | Description |
|---------|-------------|
| `src/App.jsx` | Composant principal avec routage |
| `src/pages/ChatPage.jsx` | Page principale du chat |
| `src/pages/AuthPage.jsx` | Page de connexion/inscription |
| `src/context/AuthContext.jsx` | Gestion état auth |
| `src/context/ChatContext.jsx` | Gestion état chat |
| `src/hooks/useWebSocket.js` | Hook pour WebSocket |
| `.env` | URLs API/WebSocket, durées éphémères |

### Backend (`server/`)

| Fichier | Description |
|---------|-------------|
| `index.js` | Point d'entrée Express + Socket.io |
| `models/User.js` | Schéma utilisateur MongoDB |
| `models/Message.js` | Schéma message (avec éphémère) |
| `models/Room.js` | Schéma salon |
| `routes/auth.js` | Routes d'authentification |
| `routes/rooms.js` | Routes de gestion des salons |
| `websocket/WsServer.js` | Logique Socket.io |
| `services/cleanupExpiredMessages.js` | Nettoyage auto messages |
| `.env` | Config MongoDB, JWT, cleanup |

---

## 🔧 Configuration

### Variables d'Environnement Client (`client/.env`)

```env
# URLs
VITE_WS_URL=ws://localhost:3001/ws
VITE_API_URL=http://localhost:3001/api

# Durées éphémères (en secondes)
VITE_EPHEMERAL_DURATIONS=10,30,60,120,300
VITE_EPHEMERAL_LABELS=10 sec,30 sec,1 min,2 min,5 min
```

### Variables d'Environnement Serveur (`server/.env`)

```env
# MongoDB
MONGO_URI=mongodb://localhost:27017/arcane_chat

# JWT
JWT_SECRET=votre_secret_jwt_super_securise

# Messages éphémères
MESSAGE_CLEANUP_INTERVAL=30000    # Nettoyage toutes les 30s
DEFAULT_MESSAGE_TTL=300          # TTL par défaut 5min
```

---

## 🌐 API & WebSocket

### API REST

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/auth/register` | Inscription |
| POST | `/api/auth/login` | Connexion |
| GET | `/api/rooms` | Liste des salons |
| POST | `/api/rooms` | Créer un salon |
| GET | `/api/rooms/:id/messages` | Messages d'un salon |

### WebSocket (Socket.io)

**Événements Client → Serveur :**
- `join_room` - Rejoindre un salon
- `leave_room` - Quitter un salon
- `message` - Envoyer un message
- `typing` - Indicateur de frappe

**Événements Serveur → Client :**
- `room_joined` - Salon rejoint
- `room_left` - Salon quitté
- `new_message` - Nouveau message
- `user_joined` - Utilisateur connecté
- `user_left` - Utilisateur déconnecté
- `typing` - Indicateur de frappe
- `users_online` - Liste utilisateurs en ligne

---

## 💾 Base de Données

### Collections MongoDB

**users**
```javascript
{
  username: String,
  email: String,
  password: String (haché),
  avatar: String (couleur hex),
  createdAt: Date
}
```

**rooms**
```javascript
{
  name: String,
  description: String,
  createdAt: Date
}
```

**messages**
```javascript
{
  content: String,
  author: ObjectId (ref: User),
  room: ObjectId (ref: Room),
  ephemeral: Boolean,      // ← Est éphémère ?
  ttl: Number,             // ← Durée en secondes
  expiresAt: Date,         // ← Date expiration
  createdAt: Date
}
```

---

## 🚀 Déploiement

### Production
1. Build du client : `cd client && npm run build`
2. Servir les fichiers statiques via Express
3. Configurer Nginx comme reverse proxy
4. Utiliser MongoDB Atlas pour la production

### Tests
```bash
# Lancer le serveur
cd server && npm run dev

# Lancer le client (dev)
cd client && npm run dev

# Ouvrir http://localhost:5173
```

---

## 🐛 Dépannage

### Le message éphémère ne s'efface pas
1. Vérifiez que MongoDB fonctionne
2. Vérifiez que le service cleanup s'exécute (`MESSAGE_CLEANUP_INTERVAL`)
3. Vérifiez les logs du serveur

### Le bouton ne fonctionne pas
1. Redémarrez le client après modification du `.env`
2. Vérifiez les variables `VITE_EPHEMERAL_*` dans `.env`

### WebSocket ne connecte pas
1. Vérifiez `VITE_WS_URL` dans `client/.env`
2. Vérifiez que le port est ouvert (3001)

---

## 📝 Licence

MIT - Libre d'utilisation et modification.

---

**Développé avec ❤️ pour ArcaneCore**
