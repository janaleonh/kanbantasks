@echo off
set "PATH=c:\Repos\.tools\node\node-v22.14.0-win-x64;C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
echo === Starte Kanban Tasks (Expo Server) ===
call .\node_modules\.bin\expo.cmd start --lan
pause
