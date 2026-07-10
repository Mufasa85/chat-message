# README — Debugging & Commandes de vérification

Ce document regroupe toutes les commandes utilisées pour debugger, vérifier et déployer le projet Chat App (React 19 / Node.js / MongoDB / WebSocket / WebRTC).

---

## Table des matières

1. [Setup des critères académiques](#1-setup-des-critères-académiques)
2. [Tests unitaires](#2-tests-unitaires)
3. [Vérification du backend local](#3-vérification-du-backend-local)
4. [Tests des endpoints API](#4-tests-des-endpoints-api)
5. [Gestion des utilisateurs (MongoDB)](#5-gestion-des-utilisateurs-mongodb)
6. [Vérification Docker](#6-vérification-docker)
7. [Vérification en production](#7-vérification-en-production)
8. [Nettoyage](#8-nettoyage)
9. [Git — commit et push](#9-git--commit-et-push)
10. [WebRTC — debugging audio/vidéo](#10-webrtc--debugging-audiovidéo)

---

## 1. Setup des critères académiques

### Exécuter le script d'installation

```bash
bash setup-criteres.sh
```

**À quoi ça sert :** Crée automatiquement les tests Jest, le Dockerfile, le `.dockerignore`, le `docker-compose.yml` et la GitHub Action CI.  
**Quand l'utiliser :** Au début du projet ou quand il manque les fichiers de tests / Docker / CI.

---

## 2. Tests unitaires

### Installer les dépendances

```bash
cd server
npm install
```

**À quoi ça sert :** Installe toutes les dépendances listées dans `server/package.json`, y compris Jest qui a été ajouté par le script setup.  
**Quand l'utiliser :** Après un `git clone`, après avoir modifié `package.json`, ou avant de lancer les tests.

### Lancer les tests

```bash
cd server
npm test
```

**À quoi ça sert :** Exécute les tests Jest dans `server/__tests__/` (auth, checkRole, message).  
**Résultat attendu :** `3 passed, 21 tests`.

### Lancer les tests avec couverture

```bash
cd server
npm run test:coverage
```

**À quoi ça serv :** Génère un rapport de couverture de code (`coverage/`).

### Lancer les tests en mode watch

```bash
cd server
npm run test:watch
```

**À quoi ça sert :** Relance automatiquement les tests à chaque modification de fichier.

---

## 3. Vérification du backend local

### Vérifier que MongoDB local tourne

```bash
mongosh --eval "db.adminCommand('ping')"
```

**À quoi ça sert :** Vérifie que MongoDB est démarré et accessible.  
**Résultat attendu :** `{ ok: 1 }`.  
**Si erreur :** Démarrer MongoDB avec `mongod` ou via Laragon/XAMPP.

### Démarrer le serveur backend

```bash
cd server
node index.js
```

**À quoi ça sert :** Démarre le serveur Express + WebSocket sur le port 3001 (par défaut).  
**Quand l'utiliser :** Pour tester l'API localement.

### Démarrer le serveur avec une base de test locale

```bash
cd server
MONGO_URI=mongodb://localhost:27017/chatapp_test node index.js
```

**À quoi ça sert :** Démarre le serveur en utilisant une base MongoDB locale temporaire, sans toucher à la base de production.  
**Quand l'utiliser :** Pour les tests d'API qui créent/suppriment des users.

### Vérifier la santé du serveur

```bash
curl -s http://localhost:3001/api/health && echo
```

**À quoi ça sert :** Vérifie que le serveur est démarré et répond.  
**Résultat attendu :** `{ "status": "ok" }`.

---

## 4. Tests des endpoints API

### Créer un compte test

```bash
curl -s -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser_123","password":"password123"}'
```

**À quoi ça sert :** Crée un nouvel utilisateur avec le rôle par défaut `user`.  
**Résultat attendu :** JSON avec `token` et `user`.

### Se connecter et récupérer un JWT

```bash
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser_123","password":"password123"}'
```

**À quoi ça sert :** Authentifie l'utilisateur et retourne un token JWT.  
**Résultat attendu :** JSON avec `token` et `user`.

### Tester l'accès admin avec un utilisateur normal (doit retourner 403)

```bash
TOKEN_USER="eyJ..."
curl -s -H "Authorization: Bearer $TOKEN_USER" \
  http://localhost:3001/api/admin/users
```

**À quoi ça sert :** Vérifie que le middleware `checkRole('admin')` refuse l'accès aux non-admins.  
**Résultat attendu :** `{ "error": "Accès refusé : permissions insuffisantes" }` avec HTTP 403.

### Tester l'accès admin avec un admin (doit retourner 200)

```bash
TOKEN_ADMIN="eyJ..."
curl -s -H "Authorization: Bearer $TOKEN_ADMIN" \
  http://localhost:3001/api/admin/users
```

**À quoi ça sert :** Vérifie que la route admin retourne la liste des utilisateurs.  
**Résultat attendu :** Tableau JSON des users.

---

## 5. Gestion des utilisateurs (MongoDB)

### Promouvoir un utilisateur en admin

```bash
mongosh chatapp_test --eval \
  'db.users.updateOne({username:"testuser_123"},{$set:{role:"admin"}})'
```

**À quoi ça sert :** Change le rôle d'un utilisateur en `admin` directement dans MongoDB.  
**Quand l'utiliser :** Pour tester les routes protégées admin en local.

### Supprimer la base de test

```bash
mongosh chatapp_test --eval 'db.dropDatabase()'
```

**À quoi ça sert :** Nettoie la base de test après avoir terminé les tests locaux.  
**Attention :** Irréversible — supprime tous les documents de `chatapp_test`.

### Lister tous les utilisateurs

```bash
mongosh chatapp_test --eval 'db.users.find().pretty()'
```

**À quoi ça sert :** Affiche tous les utilisateurs de la base de test.

---

## 6. Vérification Docker

### Vérifier que Docker est installé

```bash
docker --version
docker-compose --version
```

**À quoi ça sert :** Confirme que Docker et Docker Compose sont disponibles.  
**Si erreur :** Démarrer Docker Desktop (sur Windows) ou installer Docker.

### Construire et démarrer les conteneurs

```bash
docker-compose up --build -d
```

**À quoi ça sert :** Build l'image Docker du backend et démarre le conteneur.  
**Résultat attendu :** Serveur accessible sur `http://localhost:3001`.

### Vérifier la santé du conteneur

```bash
curl -s http://localhost:3001/api/health && echo
```

**À quoi ça sert :** Vérifie que le serveur dans le conteneur Docker fonctionne.

### Arrêter les conteneurs

```bash
docker-compose down
```

**À quoi ça sert :** Arrête et supprime les conteneurs créés par `docker-compose up`.

---

## 7. Vérification en production

### Vérifier le backend Render

```bash
curl -s https://chat-message-wq82.onrender.com/api/health && echo
```

**À quoi ça sert :** Vérifie que le backend déployé sur Render est en ligne.  
**Résultat attendu :** `{ "status": "ok" }`.

### Vérifier le frontend Vercel

```bash
curl -s https://chat-message-rho.vercel.app/ | head -20
```

**À quoi ça sert :** Vérifie que le frontend est déployé et retourne la page HTML.  
**Résultat attendu :** HTML avec le titre `Arcane Chat`.

### Tester le login en production

```bash
curl -s -X POST https://chat-message-wq82.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"votre_username","password":"votre_password"}'
```

**À quoi ça sert :** Vérifie l'authentification en production.  
**Remplacez** `votre_username` et `votre_password` par des identifiants réels.

---

## 8. Nettoyage

### Arrêter le serveur Node local

```bash
pkill -f "node index.js"
```

**À quoi ça sert :** Arrête le processus Node.js du serveur local.  
**Alternative :** `Ctrl + C` dans le terminal où le serveur tourne.

### Supprimer les logs temporaires

```bash
rm -f server/server.log server/server.pid
```

**À quoi ça sert :** Nettoie les fichiers temporaires créés par les tests.

---

## 9. Git — commit et push

### Voir les modifications

```bash
git status
```

**À quoi ça sert :** Liste les fichiers modifiés / nouveaux / supprimés.

### Ajouter tout et committer

```bash
git add .
git commit -m "feat: ajout tests unitaires, Docker et CI GitHub"
```

**À quoi ça sert :** Sauvegarde les modifications dans l'historique Git.

### Pousser sur GitHub

```bash
git push origin main
```

**À quoi ça sert :** Envoie les commits sur le repo distant et déclenche la GitHub Action.

### Vérifier la GitHub Action

```bash
# Ouvrir dans le navigateur :
https://github.com/Mufasa85/chat-message/actions
```

**À quoi ça sert :** Vérifie que le workflow CI a bien été exécuté et est vert.

---

## 10. WebRTC — debugging audio/vidéo

### Vérifier les connexions WebRTC (console navigateur)

```javascript
// Ouvrir la console sur https://chat-message-rho.vercel.app
// et exécuter :
const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
console.log(pc);
```

**À quoi ça sert :** Vérifie que le navigateur supporte WebRTC.

### Vérifier l'état de la connexion peer

```javascript
// Dans useWebRTC.js, ajouter temporairement :
pc.onconnectionstatechange = (e) => {
  console.log('[WebRTC] connectionState:', pc.connectionState);
};
pc.oniceconnectionstatechange = (e) => {
  console.log('[WebRTC] iceConnectionState:', pc.iceConnectionState);
};
```

**À quoi ça sert :** Affiche les états de connexion WebRTC (`connecting`, `connected`, `failed`, `disconnected`) pour diagnostiquer les problèmes audio/vidéo.

### Vérifier les serveurs ICE / TURN

```bash
# Vérifier que le serveur STUN répond (test de connectivité UDP)
# Pas de commande curl directe, mais dans la console navigateur :
```

**Vérifier les variables d'environnement TURN :**

```bash
cat server/.env | grep TURN
cat client/.env | grep TURN
```

**À quoi ça sert :** Confirme que les credentials TURN (Metered.ca) sont bien configurés côté client et serveur.  
**Sans TURN fiable**, les appels entre réseaux différents (mobile, WiFi externe, Render/Vercel) échouent ou ont un audio brouillé.

### Forcer l'affichage du flux distant

```javascript
// Dans la console du navigateur qui reçoit l'appel :
const video = document.querySelector('video');
console.log('srcObject:', video?.srcObject);
console.log('tracks:', video?.srcObject?.getTracks());
```

**À quoi ça sert :** Vérifie que le `MediaStream` distant est bien attaché à l'élément `<video>` ou `<audio>`.

### Afficher les ICE candidates dans la console

```javascript
// Temporairement, dans la console du navigateur :
window._debugIce = (pc) => {
  pc.onicecandidate = (e) => console.log('ICE candidate:', e.candidate);
  pc.onicegatheringstatechange = () => console.log('ICE gathering:', pc.iceGatheringState);
};
```

**À quoi ça sert :** Aide à diagnostiquer les problèmes de traversée NAT / pare-feu.

---

## Rappel rapide — workflow type

```bash
# 1. Vérifier MongoDB
mongosh --eval "db.adminCommand('ping')"

# 2. Démarrer le serveur local avec une base de test
MONGO_URI=mongodb://localhost:27017/chatapp_test node index.js

# 3. Vérifier la santé
curl -s http://localhost:3001/api/health

# 4. Lancer les tests
cd server && npm test

# 5. Tester l'API
curl -s -X POST http://localhost:3001/api/auth/register ...

# 6. Nettoyer
pkill -f "node index.js"
mongosh chatapp_test --eval 'db.dropDatabase()'
```
