@echo off
set "PROJECT_DIR=%~dp0"

start "Enterprise Chatbot API" /D "%PROJECT_DIR%" cmd /k npm run server
timeout /t 3 /nobreak >nul
start "Enterprise Chatbot Frontend" /D "%PROJECT_DIR%" cmd /k npm run dev -- --host 127.0.0.1

echo.
echo Enterprise Chatbot is starting.
echo Frontend: http://127.0.0.1:5173/
echo API:      http://127.0.0.1:3001/api/health
echo.
pause
