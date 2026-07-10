#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-ngrok-test.sh
#
# Expose le serveur (port 3001) et le client Vite (port 5173) via ngrok,
# pour tester les appels WebRTC entre deux appareils sur des réseaux
# différents (ex: PC en Wi-Fi, téléphone en 4G).
#
# Usage :
#   chmod +x setup-ngrok-test.sh
#   ./setup-ngrok-test.sh
#
# À lancer depuis la racine du projet (chat-app/), ou ajustez SERVER_DIR
# et CLIENT_DIR ci-dessous si votre structure diffère.
# ─────────────────────────────────────────────────────────────────────────────

set -e

SERVER_DIR="chat-app/server"
CLIENT_DIR="chat-app/client"
SERVER_PORT=3001
CLIENT_PORT=5173
ENV_FILE="$CLIENT_DIR/.env"

# Couleurs pour la lisibilité
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[ATTENTION]${NC} $1"; }
error() { echo -e "${RED}[ERREUR]${NC} $1"; }

# ── 1. Vérifier que ngrok est installé ──────────────────────────────────────
if ! command -v ngrok &> /dev/null; then
  warn "ngrok n'est pas installé."
  echo ""
  echo "Installez-le avec l'une de ces méthodes :"
  echo ""
  echo "  Windows (via Chocolatey) :"
  echo "    choco install ngrok"
  echo ""
  echo "  Windows (manuel) :"
  echo "    Téléchargez depuis https://ngrok.com/download et ajoutez ngrok.exe au PATH"
  echo ""
  echo "  npm (multiplateforme) :"
  echo "    npm install -g ngrok"
  echo ""
  exit 1
fi

info "ngrok détecté : $(ngrok version)"

# ── 2. Vérifier l'authtoken ngrok ───────────────────────────────────────────
if ! ngrok config check &> /dev/null; then
  warn "Aucun authtoken ngrok configuré."
  echo ""
  echo "  1. Créez un compte gratuit sur https://dashboard.ngrok.com/signup"
  echo "  2. Récupérez votre authtoken ici : https://dashboard.ngrok.com/get-started/your-authtoken"
  echo "  3. Exécutez :"
  echo ""
  echo "       ngrok config add-authtoken VOTRE_TOKEN_ICI"
  echo ""
  read -p "Appuyez sur Entrée une fois l'authtoken configuré pour continuer (ou Ctrl+C pour annuler)..."
fi

# ── 3. Vérifier que les dossiers existent ───────────────────────────────────
if [ ! -d "$SERVER_DIR" ]; then
  error "Dossier serveur introuvable : $SERVER_DIR"
  echo "Ajustez la variable SERVER_DIR en haut du script."
  exit 1
fi

if [ ! -d "$CLIENT_DIR" ]; then
  error "Dossier client introuvable : $CLIENT_DIR"
  echo "Ajustez la variable CLIENT_DIR en haut du script."
  exit 1
fi

# ── 4. Démarrer ngrok pour le serveur (port 3001) en arrière-plan ──────────
info "Démarrage du tunnel ngrok pour le serveur (port $SERVER_PORT)..."
ngrok http $SERVER_PORT --log=stdout > /tmp/ngrok-server.log 2>&1 &
NGROK_SERVER_PID=$!
sleep 3

# Récupérer l'URL publique via l'API locale ngrok (port 4040)
SERVER_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | grep -o '"public_url":"https://[^"]*' | head -1 | sed 's/"public_url":"//')

if [ -z "$SERVER_URL" ]; then
  error "Impossible de récupérer l'URL ngrok du serveur. Vérifiez /tmp/ngrok-server.log"
  kill $NGROK_SERVER_PID 2>/dev/null
  exit 1
fi

info "Serveur exposé sur : $SERVER_URL"

# ── 5. Démarrer ngrok pour le client (port 5173) en arrière-plan ───────────
info "Démarrage du tunnel ngrok pour le client (port $CLIENT_PORT)..."
ngrok http $CLIENT_PORT --log=stdout > /tmp/ngrok-client.log 2>&1 &
NGROK_CLIENT_PID=$!
sleep 3

CLIENT_URL=$(curl -s http://127.0.0.1:4041/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | head -1 | sed 's/"public_url":"//')

# Si le port 4041 n'existe pas (une seule instance ngrok web par défaut),
# on récupère les deux tunnels depuis l'API par défaut (port 4040)
if [ -z "$CLIENT_URL" ]; then
  CLIENT_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | grep -o '"public_url":"https://[^"]*' | sed -n '2p' | sed 's/"public_url":"//')
fi

if [ -z "$CLIENT_URL" ]; then
  warn "Impossible de récupérer automatiquement l'URL ngrok du client."
  warn "Ouvrez http://127.0.0.1:4040 dans votre navigateur pour la trouver manuellement."
else
  info "Client exposé sur : $CLIENT_URL"
fi

# ── 6. Construire l'URL WebSocket (wss://) à partir de l'URL serveur ───────
WSS_URL=$(echo "$SERVER_URL" | sed 's/https:/wss:/')/ws

# ── 7. Mettre à jour le .env du client automatiquement ──────────────────────
info "Mise à jour de $ENV_FILE ..."

# Sauvegarde de l'ancien .env si présent
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$ENV_FILE.bak"
  info "Ancien .env sauvegardé dans $ENV_FILE.bak"
fi

cat > "$ENV_FILE" <<EOF
# Généré automatiquement par setup-ngrok-test.sh — $(date)
VITE_API_URL=${SERVER_URL}/api
VITE_WS_URL=${WSS_URL}
EOF

info ".env mis à jour :"
cat "$ENV_FILE"

# ── 8. Récapitulatif final ──────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo -e "${GREEN}Configuration prête pour le test multi-réseaux${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "  Backend (API + WS) : $SERVER_URL"
echo "  Frontend (à ouvrir) : ${CLIENT_URL:-"voir http://127.0.0.1:4040"}"
echo ""
echo "Étapes suivantes :"
echo "  1. Relancez votre serveur si déjà lancé (pour qu'il prenne en compte CORS si besoin) :"
echo "       cd $SERVER_DIR && npm run dev"
echo ""
echo "  2. Relancez le frontend Vite EN EXPOSANT sur le réseau :"
echo "       cd $CLIENT_DIR && npm run dev -- --host"
echo ""
echo "  3. Sur le PC (Wi-Fi) : ouvrez ${CLIENT_URL:-l_URL_ngrok_du_client}"
echo "  4. Sur le téléphone : désactivez le Wi-Fi, passez en 4G/5G,"
echo "     ouvrez la MÊME URL ngrok ${CLIENT_URL:-ci-dessus}"
echo ""
echo "  5. Connectez-vous avec deux comptes différents et lancez un appel."
echo ""
echo "Pour arrêter les tunnels ngrok :"
echo "  kill $NGROK_SERVER_PID $NGROK_CLIENT_PID"
echo ""
echo "Dashboard ngrok (liste des tunnels actifs) : http://127.0.0.1:4040"
echo "═══════════════════════════════════════════════════════════════════"

# Garder le script actif pour que les tunnels restent ouverts (Ctrl+C pour arrêter)
trap "info 'Arrêt des tunnels ngrok...'; kill $NGROK_SERVER_PID $NGROK_CLIENT_PID 2>/dev/null; exit 0" INT TERM
info "Tunnels actifs. Appuyez sur Ctrl+C pour les arrêter."
wait
