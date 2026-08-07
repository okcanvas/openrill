@echo off
setlocal
cd /d "%~dp0\.."
python scripts\run_step014d_acceptance.py
exit /b %ERRORLEVEL%
