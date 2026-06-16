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
