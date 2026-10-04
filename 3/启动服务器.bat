@echo off
rem TuoCheng Ji local server (folder 3, port 8124)
cd /d "%~dp0"
start "" "http://127.0.0.1:8124/"
python serve.py 8124
