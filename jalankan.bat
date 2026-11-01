@echo off
where node >nul 2>nul || (echo Node.js belum terpasang. Unduh dari https://nodejs.org lalu coba lagi. & pause & exit /b)
echo Membuka http://localhost:3000 ...
start "" http://localhost:3000
node server.js
pause
