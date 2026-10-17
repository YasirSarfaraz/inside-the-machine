@echo off
rem Serves the site locally (ES modules need http://, not file://) and opens it.
cd /d "%~dp0"
start "" http://localhost:8137/
python serve.py 8137
