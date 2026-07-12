# ═══════════════════════════════════════════════════════════════════════════
# Dockerfile — client React 19 + Vite
# ═══════════════════════════════════════════════════════════════════════════

# ── Étape 1 : Build de l'application React ─────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances pour optimiser le cache Docker
COPY package*.json ./

# Installer les dépendances de manière reproductible
RUN npm ci

# Copier le reste du code source
COPY . .

# Variables d'environnement utilisées par Vite au moment du build
# Par défaut : le client appelle le serveur via localhost:3001
# (car le navigateur accède au serveur via le port exposé 3001)
ARG VITE_API_URL=http://localhost:3001/api
ARG VITE_WS_URL=ws://localhost:3001/ws
ARG VITE_METERED_API_KEY

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_METERED_API_KEY=${VITE_METERED_API_KEY}

# Build de l'application
RUN npm run build

# ── Étape 2 : Serveur Nginx pour servir l'application en production ──────────
FROM nginx:alpine AS production

# Copier la configuration Nginx pour une SPA React
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier les fichiers statiques générés par Vite
COPY --from=builder /app/dist /usr/share/nginx/html

# Exposer le port 80
EXPOSE 80

# Lancer Nginx en premier plan
CMD ["nginx", "-g", "daemon off;"]
