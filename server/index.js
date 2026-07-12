require('dotenv').config();
const https = require('https');
const http = require('http');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const uploadRoutes = require('./routes/upload');
const adminRoutes = require('./routes/admin'); // ← AJOUT
const dmRoutes    = require('./routes/dm');
const { initWsServer } = require('./websocket/WsServer');
const cleanupService = require('./services/cleanupExpiredMessages');

const app = express();

const useHttps = process.env.USE_HTTPS === 'true';
const server = useHttps
  ? require('https').createServer({
      key:  fs.readFileSync('./10.173.193.120+2-key.pem'),
      cert: fs.readFileSync('./10.173.193.120+2.pem'),
    }, app)
  : http.createServer(app);

const allowedOrigins = [
  'https://localhost:5173',
  'https://127.0.0.1:5173',
  'https://10.173.193.120:5173',
  'https://10.173.193.120:3001',
  'https://10.173.193.120',
  'https://chat-message-rho.vercel.app', // ← AJOUT
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, true);
  },
  credentials: true,
}));

app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes); // ← AJOUT
app.use('/api/dm',    dmRoutes);
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

initWsServer(server);

const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chatapp';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('[DB] MongoDB connecté');
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