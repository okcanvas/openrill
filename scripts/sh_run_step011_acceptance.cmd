@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step011_acceptance.py %*
exit /b %ERRORLEVEL%
