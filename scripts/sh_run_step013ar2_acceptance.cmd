@echo off
setlocal
cd /d "%~dp0.."
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
python scripts\run_step013ar2_acceptance.py
exit /b %ERRORLEVEL%
