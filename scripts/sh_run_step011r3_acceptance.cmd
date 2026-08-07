@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step011r3_acceptance.py %*
