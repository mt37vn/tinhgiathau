@echo off
title Cai dat Dauthau Windows Service

REM Kiem tra quyen Administrator
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    color 4F
    echo.
    echo ============================================
    echo  CANH BAO: Thieu quyen Administrator!
    echo ============================================
    echo.
    echo  Script nay CAN quyen Administrator de tao service.
    echo.
    echo  CACH 1: Chuot phai - Run as Administrator
    echo  CACH 2: Mo CMD Admin roi g:
    echo      cd /d C:\dauthau\scripts
    echo      windows-setup.bat
    echo.
    pause
    exit /b 1
)

echo ============================================
echo  Cai dat Phan mem Tinh Gia Chao Thau
echo  Phuong an: Windows native + NSSM
echo ============================================
echo.
echo  Administrator: OK
echo.
pause

REM ---------- KIEM TRA ----------
echo [1/6] Kiem tra Node.js...
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 goto :errNoNode
for /f "tokens=*" %%a in ('node --version') do set NODE_VER=%%a
echo     Node.js: %NODE_VER%
goto :step2

:errNoNode
echo.
echo ERROR: Chua cai Node.js.
echo Vao https://nodejs.org tai Node.js 22 LTS roi cai dat.
echo.
pause
exit /b 1

:step2
REM ---------- TAO THU MUC ----------
echo [2/6] Tao thu muc...
mkdir C:\dauthau\logs       >nul 2>&1
mkdir C:\dauthau\data       >nul 2>&1
mkdir C:\dauthau\backup     >nul 2>&1
echo     OK

REM ---------- TAO BIEN MOI TRUONG ----------
echo [3/6] Thiet lap bien moi truong...
set SESS_SECRET=
set /p SESS_SECRET="Nhap SESSION_SECRET (Enter de tu tao): "
if "%SESS_SECRET%"=="" (
    echo     Dang tao SESSION_SECRET tu dong...
    for /f "tokens=* delims=" %%a in ('powershell -Command "[guid]::NewGuid().ToString()"') do set SESS_SECRET=%%a
)
set PORT=3456
set APP_VERSION=v2.5
echo     PORT=%PORT%
echo     APP_VERSION=%APP_VERSION%
echo     SESSION_SECRET=%SESS_SECRET%

REM ---------- CAI DEPENDENCIES ----------
echo [4/6] Cai dependencies...
cd /d C:\dauthau
call npm install --omit=dev
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: npm install that bai.
    pause
    exit /b 1
)
echo     OK

REM ---------- CAI CHROMIUM ----------
echo [5/6] Cai Chromium cho Playwright...
call npx playwright install chromium
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo CANH BAO: Playwright chromium cai that bai.
    echo Tinh nang fetch IB se khong hoat dong.
    echo Co the chay lai sau bang: npx playwright install chromium
)
echo     OK

REM ---------- TAO NSSM SERVICE ----------
echo [6/6] Tao Windows Service voi NSSM...
where nssm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Chua cai NSSM.
    echo.
    echo Cach cai:
    echo   1. Vao https://nssm.cc/download
    echo   2. Tai nssm-2.24.zip
    echo   3. Giai nen, copy nssm.exe vao C:\Windows\System32\
    echo   4. Chay lai script nay.
    echo.
    pause
    exit /b 1
)

REM Xoa service cu neu co (suppress all errors)
nssm status Dauthau >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    nssm stop Dauthau >nul 2>&1
    nssm remove Dauthau confirm >nul 2>&1
)
nssm install Dauthau "C:\Program Files\nodejs\node.exe" "%CD%\server.js"
nssm set Dauthau AppDirectory "%CD%"
nssm set Dauthau AppEnvironmentExtra PORT=%PORT% SESSION_SECRET=%SESS_SECRET% APP_VERSION=%APP_VERSION%
nssm set Dauthau Start SERVICE_AUTO_START
nssm set Dauthau AppStdout "%CD%\logs\output.log"
nssm set Dauthau AppStderr "%CD%\logs\error.log"
nssm set Dauthau AppRotateFiles 1
nssm set Dauthau AppRotateSeconds 86400
nssm set Dauthau AppPriority NORMAL

nssm start Dauthau
timeout /t 3 >nul
nssm status Dauthau

echo.
echo ============================================
echo  CAI DAT HOAN TAT!
echo.
echo  App dang chay tai: http://localhost:%PORT%
echo.
echo  Kiem tra:
echo    nssm status Dauthau
echo    nssm restart Dauthau
echo.
echo  Log:
echo    C:\dauthau\logs\output.log
echo    C:\dauthau\logs\error.log
echo.
echo  Tai khoan mac dinh: admin / admin123
echo ============================================
pause
