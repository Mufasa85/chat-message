// Charge les variables d'environnement depuis le fichier .env (PORT, MONGO_URI, JWT_SECRET...)
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const express = require('express'); // Framework HTTP pour l'API REST
const mongoose = require('mongoose'); // ORM pour parler à MongoDB
const cors = require('cors'); // Autorise le frontend (autre origine) à appeler l'API
const path = require('path');

// Import des routes — chaque fichier gère un groupe d'endpoints
const authRoutes = require('./routes/auth'); // POST /api/auth/login, /register
const roomRoutes = require('./routes/rooms'); // GET/POST /api/rooms, messages...
const uploadRoutes = require('./routes/upload'); // POST /api/upload (images, audio, fichiers)
const adminRoutes = require('./routes/admin'); // GET /api/admin/users, stats...
const dmRoutes = require('./routes/dm'); // GET /api/dm/conversations, messages

// Le serveur WebSocket temps réel (messages instantanés, appels vidéo...)
const { initWsServer } = require('./websocket/WsServer');

// Service qui supprime automatiquement les messages éphémères expirés
const cleanupService = require('./services/cleanupExpiredMessages');

// Création de l'application Express
const app = express();

// En local avec certificat auto-signé → HTTPS, sinon HTTP simple
const useHttps = process.env.USE_HTTPS === 'true';
const server = useHttps
  ? require('https').createServer(
      {
        key: fs.readFileSync('./10.173.193.120+2-key.pem'),
        cert: fs.readFileSync('./10.173.193.120+2.pem'),
      },
      app
    )
  : http.createServer(app);

// Origines autorisées à appeler l'API (sécurité CORS)
// Sans ça, le navigateur bloquerait les requêtes du frontend vers le backend
const allowedOrigins = [
  'https://localhost:5173',
  'https://127.0.0.1:5173',
  'https://10.173.193.120:5173',
  'https://10.173.193.120:3001',
  'https://10.173.193.120',
  'https://chat-message-rho.vercel.app',
];

// Middleware CORS — appliqué à toutes les routes avant qu'elles soient traitées
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // Requêtes server-to-server (sans origin)
      if (allowedOrigins.includes(origin)) return callback(null, true); // Origin connue → OK
      return callback(null, true); // Actuellement tout autorisé (à restreindre en prod)
    },
    credentials: true, // Autorise l'envoi de cookies/headers d'authentification
  })
);

// Parse automatiquement les corps de requête JSON
app.use(express.json());

// Sert les fichiers uploadés localement (PDF, Word, Excel...) en accès public
// Ex: GET /uploads/1234567890-rapport.pdf → télécharge le fichier
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Montage des routes — chaque préfixe /api/xxx est géré par son fichier
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dm', dmRoutes);

// Route de santé — utilisée par Docker pour vérifier que le serveur tourne
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

// Attache le serveur WebSocket au même serveur HTTP (même port 3001)
// HTTP → API REST, WebSocket → temps réel, les deux sur le port 3001
initWsServer(server);

const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chatapp';

// Connexion à MongoDB puis démarrage du serveur
// On attend que la BDD soit prête avant d'accepter des requêtes
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('[DB] MongoDB connecté');
    // Démarre le service de nettoyage des messages éphémères expirés
    const cleanupInterval =
      parseInt(process.env.MESSAGE_CLEANUP_INTERVAL) || 30000;
    cleanupService.start(cleanupInterval);
    // Écoute sur toutes les interfaces réseau (0.0.0.0) pour être accessible en réseau local et Docker
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[API] Serveur démarré sur http://0.0.0.0:${PORT}`);
      console.log(`[API] Accessible depuis: http://10.173.193.120:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[DB] Erreur de connexion MongoDB:', err.message);
    process.exit(1); // Arrêt du processus si pas de BDD → inutile de continuer
  });
