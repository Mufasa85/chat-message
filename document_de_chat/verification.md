Tu es un ingénieur senior chargé de vérifier et valider une application web 
full-stack de messagerie instantanée avec appels audio/vidéo (WebRTC), 
développée avec React 19 / Node.js / Express / MongoDB / WebSocket.

Le repo GitHub est : https://github.com/Mufasa85/chat-message

---

## CONTEXTE DU PROJET

Structure du repo (monorepo) :
- client/ → frontend React 19 + Vite, déployé sur Vercel
- server/ → backend Node.js + Express + WebSocket, déployé sur Render

URLs de production :
- Frontend : https://chat-message-rho.vercel.app
- Backend  : https://chat-message-wq82.onrender.com

---

## CE QUE TU DOIS VÉRIFIER

### 1. CRITÈRES ACADÉMIQUES — vérifier que chaque élément est bien présent dans le code

[ ] server/models/User.js contient un champ "role" avec enum ['user', 'admin'] et default 'user'
[ ] server/middleware/checkRole.js existe et exporte une fonction checkRole(...roles)
[ ] server/routes/admin.js existe avec les routes GET /users, PATCH /users/:id/role, DELETE /users/:id
[ ] server/index.js importe adminRoutes et le branche sur /api/admin
[ ] server/__tests__/auth.test.js existe et contient des tests Jest valides
[ ] server/__tests__/checkRole.test.js existe et contient des tests Jest valides  
[ ] server/__tests__/message.test.js existe et contient des tests Jest valides
[ ] server/package.json contient les scripts "test", "test:coverage" et jest en devDependencies
[ ] server/Dockerfile existe et est valide
[ ] server/.dockerignore existe
[ ] docker-compose.yml existe à la racine
[ ] .github/workflows/ci.yml existe avec une GitHub Action qui lance npm test

### 2. TESTS UNITAIRES — les lancer et vérifier qu'ils passent tous

cd server
npm install
npm test

Résultat attendu : tous les tests passent (✓ vert), aucun échec (✗ rouge).
Si des tests échouent, identifie pourquoi et corrige.

### 3. VÉRIFICATION EN LOCAL

Démarre le backend localement et vérifie les endpoints suivants :
- GET  http://localhost:3001/api/health → doit retourner { status: 'ok' }
- POST http://localhost:3001/api/auth/register → créer un compte test
- POST http://localhost:3001/api/auth/login → se connecter, récupérer un JWT
- GET  http://localhost:3001/api/admin/users (avec le JWT dans Authorization: Bearer <token>) → 
  doit retourner 403 si l'user n'est pas admin, 200 si admin

Pour tester Docker :
docker-compose up --build
→ le serveur doit démarrer sur le port 3001

### 4. VÉRIFICATION EN PRODUCTION

Teste les endpoints de production :
- GET  https://chat-message-wq82.onrender.com/api/health
- POST https://chat-message-wq82.onrender.com/api/auth/login
- GET  https://chat-message-rho.vercel.app (page de login doit s'afficher)

Vérifie que la connexion WebSocket fonctionne depuis le frontend Vercel 
vers le backend Render (ouvre la console du navigateur sur 
https://chat-message-rho.vercel.app et vérifie l'absence d'erreurs WebSocket).

### 5. GITHUB ACTIONS

Vérifie que le fichier .github/workflows/ci.yml est correct et que 
la dernière exécution dans l'onglet Actions de 
https://github.com/Mufasa85/chat-message/actions 
est verte (tous les tests ont passé en CI).

---

## CE QUE TU DOIS PRODUIRE

1. Un rapport de vérification listant chaque critère avec son statut :
   ✅ OK / ❌ Manquant ou cassé / ⚠️ Présent mais à corriger

2. Pour chaque ❌ ou ⚠️ : le code exact à ajouter/corriger, avec le 
   chemin du fichier concerné.

3. Une confirmation finale : "Tous les critères sont remplis et 
   fonctionnels en local et en production" ou une liste des 
   problèmes restants à régler.

---

## CONTRAINTES IMPORTANTES

- Ne change RIEN au code existant si ce n'est pas nécessaire pour 
  corriger un critère manquant.
- Ne supprime aucun fichier existant.
- Les variables sensibles (JWT_SECRET, MONGO_URI, clés Cloudinary) 
  sont dans server/.env — ne les expose jamais, utilise des valeurs 
  de test dans les tests unitaires.
- Le projet utilise MongoDB (NoSQL), pas PostgreSQL — c'est un choix 
  architectural assumé, ne migre pas la base de données.