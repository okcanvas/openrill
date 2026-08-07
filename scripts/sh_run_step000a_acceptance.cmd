@echo off
setlocal
python "%~dp0run_step000a_acceptance.py"
if errorlevel 1 exit /b %errorlevel%
endlocal
