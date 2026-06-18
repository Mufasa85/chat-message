tree du prjet

chat-app/
│
├── client/                         # Frontend React + Vite
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── public/
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── App.css
│       ├── index.css
│       ├── context/
│       │   ├── AuthContext.jsx     # Gestion auth (login / register / logout)
│       │   └── ChatContext.jsx     # State global chat + actions WS
│       ├── hooks/
│       │   └── useWebSocket.js     # Hook WS avec reconnexion auto
│       └── pages/
│           ├── AuthPage.jsx        # Page login / inscription
│           └── ChatPage.jsx        # Interface principale du chat
│
└── server/                         # Backend Node.js + Express + WS
    ├── index.js                    # Point d'entrée (Express + MongoDB + WS)
    ├── package.json
    ├── .env.example
    ├── middleware/
    │   └── auth.js                 # Vérification JWT (REST & WebSocket)
    ├── models/                     # Schémas Mongoose
    │   ├── User.js                 # username, password (hashé), avatar
    │   ├── Room.js                 # name, type, members[]
    │   └── Message.js              # room, author, content, createdAt
    ├── routes/                     # API REST
    │   ├── auth.js                 # POST /register, POST /login, GET /me
    │   └── rooms.js                # GET /rooms, POST /rooms, GET /rooms/:id/messages
    └── websocket/
        └── WsServer.js             # Gestion des événements temps réel


   Terminal 1 - Backend
cd server && npm run dev

  Terminal 2 - Frontend
cd client && npm run dev



 Système d'Upload de Fichiers - Explication

 📤 ENVOI DE FICHIERS

**1. Frontend (Client) - `client/src/hooks/useFileUpload.jsx`**

```javascript
// Hook personnalisé useFileUpload
- XMLHttpRequest (XHR) pour uploader avec barre de progression
- FormData pour envoyer le fichier + roomId
- WebSocket pour broadcaster l'upload aux autres utilisateurs
```

**Flux d'envoi :**
1. `FileInput` = bouton qui ouvre un input file caché
2. `upload(file, roomId)` = fonction qui :
   - Crée un `FormData` avec le fichier
   - Envoie via `XMLHttpRequest` POST vers `/api/upload`
   - Affiche la progression avec `xhr.upload.onprogress`
   - Broadcast le message via WebSocket quand l'upload est terminé

**2. Backend (Serveur) - `server/routes/upload.js`**

```javascript
POST /api/upload
- authMiddleware : vérifie le token JWT
- upload.single('file') : multer traite le fichier
- CloudinaryStorage : stocke sur Cloudinary
- Message.create() : crée un message avec l'attachment
```

**3. Middleware Cloudinary - `server/middleware/upload.js`**

```javascript
- multer : gère la réception du fichier (limite 50MB)
- CloudinaryStorage : upload directement sur Cloudinary
- fileFilter : bloque les .exe, .sh, .bat (sécurité)
```

---

 📥 RÉCUPÉRATION DES FICHIERS

Les fichiers sont automatiquement :
1. **Stockés sur Cloudinary** (URL dans `attachment.url`)
2. **Créés comme Message** dans MongoDB avec le type approprié (image/video/audio/file)
3. **Broadcastés via WebSocket** à tous les utilisateurs du salon
4. **Affichés dans MessageBubble** selon le type

---

 📁 Types supportés
- **Images** : jpg, png, gif, webp
- **Vidéos** : mp4, mov, avi, webm  
- **Audio** : mp3, wav, ogg, m4a
- **Fichiers** : pdf, doc, docx, xls, xlsx, txt, zip

Le fichier est stocké sur **Cloudinary** et l'URL est sauvegardée en base MongoDB dans le modèle `Message`.