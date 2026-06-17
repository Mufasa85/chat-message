require('dotenv').config();
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const { initWsServer } = require('./websocket/WsServer');
const cleanupService = require('./services/cleanupExpiredMessages');

const app = express();
const server = http.createServer(app);

// Autoriser les connexions depuis le téléphone
const allowedOrigins = [
  'http://localhost:5173',
  'http://10.173.193.120:5173',
  'http://10.173.193.120:3001'
];

app.use(cors({ 
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origin not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

initWsServer(server);

const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chatapp';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('[DB] MongoDB connecté');
    
    // Démarrer le service de nettoyage des messages éphémères
    const cleanupInterval = parseInt(process.env.MESSAGE_CLEANUP_INTERVAL) || 30000;
    cleanupService.start(cleanupInterval);
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[API] Serveur démarré sur http://0.0.0.0:${PORT}`);
      console.log(`[API] Accessible depuis: http://10.173.193.120:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[DB] Erreur de connexion MongoDB:', err.message);
    process.exit(1);
  });
