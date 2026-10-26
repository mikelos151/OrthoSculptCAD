@echo off
setlocal
cd /d "%~dp0"
if exist "OrthoSculptCAD.exe" (
  start "OrthoSculpt CAD" "%~dp0OrthoSculptCAD.exe"
  exit /b 0
)
where node >nul 2>nul
if errorlevel 1 (
  echo Brak Node.js. Ta paczka nie zawiera pliku .exe. Zainstaluj Node.js 22 lub nowszy i uruchom ponownie.
  pause
  exit /b 1
)
if exist "dist\index.html" goto :serve
if not exist "node_modules\" (
  echo Instalowanie zaleznosci. Tylko ten krok wymaga internetu.
  call npm ci
  if errorlevel 1 goto :error
)
call npm run build
if errorlevel 1 goto :error
:serve
start "OrthoSculpt CAD" "http://127.0.0.1:4174"
node scripts\server.mjs
if errorlevel 1 goto :error
exit /b 0
:error
echo Nie udalo sie uruchomic programu. Sprawdz komunikat powyzej.
pause
exit /b 1
