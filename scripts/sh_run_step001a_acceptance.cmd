@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step001a_acceptance.py %*
exit /b %ERRORLEVEL%
