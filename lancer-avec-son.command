#!/bin/zsh
# lancer-avec-son.command — LANCE LE SITE AVEC LE SON DES VIDÉOS ACTIVÉ D'OFFICE
# ------------------------------------------------------------
# Double-cliquer ce fichier dans le Finder :
#   1. démarre le serveur (npm run dev) ;
#   2. ouvre Google Chrome avec l'option qui autorise le son sans clic
#      (--autoplay-policy=no-user-gesture-required).
# Chrome est ouvert avec un profil séparé (dossier .chrome-son) : sinon, si Chrome
# est déjà ouvert, l'option serait ignorée. Fermer la fenêtre du terminal arrête le serveur.

cd "$(dirname "$0")"
PORT=5173
URL="http://localhost:$PORT"

npm run dev -- --port "$PORT" --strictPort &
SERVER=$!
trap "kill $SERVER 2>/dev/null" EXIT

# Attend que le serveur réponde.
until curl -s -o /dev/null "$URL"; do sleep 0.3; done

open -na "Google Chrome" --args \
  --user-data-dir="$PWD/.chrome-son" \
  --autoplay-policy=no-user-gesture-required \
  --no-first-run \
  --new-window "$URL"

wait $SERVER
