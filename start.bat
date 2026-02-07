@echo off
cd /d "%~dp0"

echo Starting backend...
start "Backend" cmd /c "cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

echo Waiting for backend to start...
timeout /t 5 /nobreak > nul

echo Starting frontend...
start "Frontend" cmd /c "cd frontend && npm run dev"

echo.
echo Servers starting...
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.
pause
