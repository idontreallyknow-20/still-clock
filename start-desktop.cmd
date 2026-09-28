@echo off
cd /d "%~dp0desktop"
if not exist node_modules\electron\dist\electron.exe (
  echo First run: downloading the desktop shell, this takes a minute...
  call npm install --no-audit --no-fund || (pause & exit /b 1)
)
start "" node_modules\electron\dist\electron.exe .
