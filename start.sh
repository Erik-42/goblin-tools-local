#!/usr/bin/env sh
# Goblin Tools — édition locale
# Lance le serveur et ouvre le navigateur (mode local par défaut)
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1 && ! command -v python >/dev/null 2>&1; then
    echo "Python est introuvable. Installe Python 3.10+ et ajoute-le au PATH." >&2
    exit 1
fi

PY=python3
command -v python3 >/dev/null 2>&1 || PY=python

$PY -c "import fastapi, uvicorn, httpx" >/dev/null 2>&1 || {
    echo "Premier lancement, installation des dépendances..."
    $PY -m pip install -r requirements.txt
}

echo "Goblin Tools — édition locale : http://127.0.0.1:8765  (ferme cette fenêtre pour arrêter)"
$PY run.py --host 127.0.0.1 --port 8765
