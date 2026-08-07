@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step011r8_acceptance.py %*
exit /b %ERRORLEVEL%
