# ── Image de base ─────────────────────────────────────────────────
FROM node:20-alpine

# Répertoire de travail dans le conteneur
WORKDIR /app

# Copier uniquement les fichiers de dépendances en premier
# (optimisation du cache Docker : si package.json ne change pas,
#  cette couche est réutilisée sans réinstaller les modules)
COPY package*.json ./

# Installer les dépendances de production uniquement
RUN npm install --production

# Copier le reste du code source
COPY . .

# Port exposé par l'application
EXPOSE 3001

# Variable d'environnement pour indiquer qu'on est en production
ENV NODE_ENV=production

# Commande de démarrage
CMD ["node", "index.js"]
