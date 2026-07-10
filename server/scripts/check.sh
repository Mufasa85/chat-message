#!/usr/bin/env bash
# Script de vérification rapide avant commit
echo "=== Vérification pré-commit ==="
echo ""

echo "→ Lancement des tests unitaires..."
cd server && npm test
echo ""

echo "→ Vérification de la santé du serveur (si en cours)..."
curl -s http://localhost:3001/api/health && echo " ✔ Serveur OK" || echo " ✗ Serveur non démarré (normal si en CI)"
echo ""

echo "=== Vérification terminée ==="
