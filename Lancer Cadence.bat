@echo off
chcp 65001 >nul
title Cadence Studio
cd /d "%~dp0"
echo.
echo   Cadence Studio demarre... le navigateur va s'ouvrir.
echo   (Garde cette fenetre ouverte pendant que tu travailles.)
echo.
python server.py
pause
