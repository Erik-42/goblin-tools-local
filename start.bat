# Goblin Tools — édition locale
# Double-clic : installe les dépendances, démarre le serveur et ouvre le navigateur
@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul || (echo Python est introuvable. Installe Python 3.10+ et ajoute-le au PATH. & pause & exit /b 1)

python -c "import fastapi, uvicorn, httpx" >nul 2>nul || (
    echo Premier lancement, installation des dépendances...
    python -m pip install -r requirements.txt
)

start "" http://127.0.0.1:8765
echo Goblin Tools — édition locale : http://127.0.0.1:8765  (ferme cette fenêtre pour arrêter)
python -m uvicorn server.main:app --host 127.0.0.1 --port 8765
