@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step011r2_acceptance.py %*
