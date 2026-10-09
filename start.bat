# Goblin Tools 本地版 —— 启动脚本
# 双击运行：自动装依赖、启动服务并打开浏览器
@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul || (echo 未找到 Python，请先安装 Python 3.10+ 并加入 PATH & pause & exit /b 1)

python -c "import fastapi, uvicorn, httpx" >nul 2>nul || (
    echo 首次运行，正在安装依赖...
    python -m pip install -r requirements.txt
)

start "" http://127.0.0.1:8765
echo Goblin Tools 本地版运行中： http://127.0.0.1:8765  （关闭此窗口即停止）
python -m uvicorn server.main:app --host 127.0.0.1 --port 8765
