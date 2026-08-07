@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step013a_acceptance.py
exit /b %ERRORLEVEL%
