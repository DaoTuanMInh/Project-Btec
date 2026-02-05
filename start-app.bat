@echo off
title AVO SECURE MEETING - LAUNCHER

echo ===================================================
echo   DANG KHOI DONG HE THONG ZERO TRUST MEETING...
echo   (Che do: ALL-IN-ONE SERVER)
echo ===================================================

echo [1/2] Khoi dong Server + Web (3001)...
start "AVO - All-in-One Server" cmd /k "node server.js"

timeout /t 5 >nul

echo [2/2] Mo duong ham Ngrok...
echo.
echo ===================================================
echo   LUU Y QUAN TRONG:
echo   Hay copy duong link 'https://....ngrok-free.app'
echo   tu cua so Ngrok vua hien ra de gui cho moi nguoi.
echo ===================================================
echo.

start "AVO - Ngrok Tunnel" cmd /k ".\ngrok http https://localhost:3001"

echo XONG!
echo Hay truy cap link Ngrok de test!
pause
