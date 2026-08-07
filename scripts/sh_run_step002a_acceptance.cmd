@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step002a_acceptance.py %*
exit /b %ERRORLEVEL%
