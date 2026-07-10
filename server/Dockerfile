# ═══════════════════════════════════════════════════════════════════════════
# Dockerfile — backend Node.js + Express + WebSocket
# ═══════════════════════════════════════════════════════════════════════════

# ── Image de base LTS ──────────────────────────────────────────────────────
FROM node:20-alpine

# Répertoire de travail dans le conteneur
WORKDIR /app

# Copier les fichiers de dépendances pour optimiser le cache Docker
# (si package.json/package-lock.json ne changent pas, cette couche est réutilisée)
COPY package*.json ./

# Installer les dépendances de production de manière reproductible
RUN npm ci --only=production

# Copier le reste du code source
COPY . .

# Port exposé par l'application
EXPOSE 3001

# Variable d'environnement pour indiquer qu'on est en production
ENV NODE_ENV=production

# Commande de démarrage
CMD ["node", "index.js"]
