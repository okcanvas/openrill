@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step001c_acceptance.py %*
