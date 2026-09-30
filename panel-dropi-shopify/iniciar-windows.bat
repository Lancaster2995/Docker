@echo off
chcp 65001 >nul
title Panel Dropi Facil
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta Node.js. Descargalo de https://nodejs.org ^(version LTS^), instalalo y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)
set ABRIR_NAVEGADOR=1
node server.js
pause
