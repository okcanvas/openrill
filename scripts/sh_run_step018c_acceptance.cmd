@echo off
setlocal
python scripts\run_step018c_acceptance.py %*
exit /b %ERRORLEVEL%
