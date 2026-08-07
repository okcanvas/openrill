@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step007_acceptance.py
exit /b %ERRORLEVEL%
