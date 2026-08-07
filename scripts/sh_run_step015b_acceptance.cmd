@echo off
setlocal
python scripts\run_step015b_acceptance.py %*
exit /b %ERRORLEVEL%
