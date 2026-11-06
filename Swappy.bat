@echo off
rem swappy 로컬 단독 실행 — 더블클릭하면 필요한 런타임을 내려받아(처음 한 번) 서버와 휴대폰 크기 창을 띄웁니다.
rem   Swappy.bat          실행
rem   Swappy.bat reset    DB를 처음 상태로 되돌리고 실행
rem   Swappy.bat stop     떠 있는 서버·DB 종료
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0standalone\start.ps1" %*
if errorlevel 1 (
  echo.
  echo 실행에 실패했습니다. 위 메시지와 .runtime\logs 폴더의 로그를 확인해 주세요.
  pause
)
