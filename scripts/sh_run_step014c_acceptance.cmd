@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step014c_acceptance.py %*
exit /b %ERRORLEVEL%
