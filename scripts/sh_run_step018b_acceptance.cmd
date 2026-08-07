@echo off
setlocal
python scripts\run_step018b_acceptance.py %*
exit /b %ERRORLEVEL%
