@echo off
chcp 65001 >nul
title Cai dat Dauthau Windows Service
echo ============================================
echo  Cai dat Phan mem Tinh Gia Chao Thau
echo  Phuong an: Windows native + NSSM
echo ============================================
echo.
echo Chay script nay voi quyen Administrator.
echo.
pause

rem ---------- KIEM TRA ----------
echo [1/6] Kiem tra Node.js...
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Chua cai Node.js.
    echo Vao https://nodejs.org tai Node.js 22 LTS .msi (64-bit) roi cai dat.
    pause
    exit /b 1
)
echo     Node.js: OK (%node --version%)

rem ---------- TAO THU MUC ----------
echo [2/6] Tao thu muc...
mkdir C:\dauthau\logs       >nul 2>&1
mkdir C:\dauthau\data       >nul 2>&1
mkdir C:\dauthau\backup     >nul 2>&1
echo     OK

rem ---------- TAO BIEN MOI TRUONG ----------
echo [3/6] Thiet lap bien moi truong...
set /p SESS_SECRET="Nhap SESSION_SECRET (an Enter de tu tao): "
if "%SESS_SECRET%"=="" (
    for /f %%i in ('powershell -Command "[guid]::NewGuid().ToString()"') do set SESS_SECRET=%%i
)
set PORT=3456
set APP_VERSION=v2.4
echo     PORT=%PORT%
echo     APP_VERSION=%APP_VERSION%
echo     SESSION_SECRET=%SESS_SECRET%

rem ---------- CAI DEPENDENCIES ----------
echo [4/6] Cai dependencies...
cd /d C:\dauthau
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm install that bai.
    pause
    exit /b 1
)
echo     OK

rem ---------- CAI CHROMIUM ----------
echo [5/6] Cai Chromium cho Playwright...
call npx playwright install chromium
if %ERRORLEVEL% NEQ 0 (
    echo CANH BAO: Playwright chromium cai that bai.
    echo Tinh nang fetch IB se không hoat dong.
)
echo     OK

rem ---------- TAO NSSM SERVICE ----------
echo [6/6] Tao Windows Service voi NSSM...
where nssm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Chua cai NSSM.
    echo https://nssm.cc/download
    echo Tai file nssm-2.24.zip, giai nen, copy nssm.exe vao C:\Windows\System32\
    echo Sau do chay lai script nay.
    pause
    exit /b 1
)

nssm stop Dauthau >nul 2>&1
nssm remove Dauthau confirm >nul 2>&1
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
