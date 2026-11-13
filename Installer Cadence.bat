@echo off
chcp 65001 >nul
title Installation de Cadence Studio
cd /d "%~dp0"
echo.
echo   Installation de Cadence Studio
echo   ------------------------------
where python >nul 2>nul
if errorlevel 1 (
  echo   Python n'est pas installe. Installe-le depuis https://www.python.org/downloads/
  echo   en cochant "Add python.exe to PATH", puis relance ce fichier.
  pause
  exit /b 1
)
echo   1/2 Installation des modules Python...
python -m pip install --upgrade pip >nul
python -m pip install -r requirements.txt
if errorlevel 1 ( echo   Erreur pendant l'installation des modules. & pause & exit /b 1 )
echo   2/2 Telechargement du modele de transcription (une seule fois, ~1,5 Go)...
python -c "import truststore; truststore.inject_into_ssl()" 2>nul
python -c "from faster_whisper import WhisperModel; WhisperModel('medium', device='cpu', compute_type='int8'); print('   Modele pret.')"
echo.
echo   Installation terminee. Lance "Lancer Cadence.bat".
pause
