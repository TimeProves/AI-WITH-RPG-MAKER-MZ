@echo off
setlocal
set "ROOT=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%tools\ai-rpg-maker\start-workbench.ps1"
endlocal
