@echo off
rem Launcher wrapper for start-app.ps1.
rem
rem Windows blocks .ps1 files by default (ExecutionPolicy Restricted). This
rem wrapper bypasses that for this one invocation only -- it changes no machine
rem or user setting, and nothing outside this command is affected.
rem
rem Usage:
rem   start-app.cmd
rem   start-app.cmd status
rem   start-app.cmd logs
rem   start-app.cmd stop
rem   start-app.cmd -Rebuild

setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-app.ps1" %*
exit /b %ERRORLEVEL%
