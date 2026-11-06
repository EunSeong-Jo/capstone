# swappy 로컬 단독 실행 (Windows). Swappy.bat 이 부른다. 설명서: docs/로컬실행.md
#   (없음)   실행: 처음에만 Python·Postgres 를 내려받아 .runtime 에 풀고, DB를 만들고 시연 데이터를 채운 뒤 창을 띄운다
#   reset    DB를 지우고 처음부터 다시
#   stop     떠 있는 서버·DB 종료
param([string]$Action = 'run')
# 네이티브 명령(psql·pip 등)이 stderr 로 안내문을 내도 예외로 바뀌지 않게 한다(Windows PowerShell 5.1). 실패는 종료 코드로 직접 검사한다.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest 진행 표시줄이 내려받기를 몇 배 느리게 만든다

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RT = Join-Path $Root '.runtime'
$Logs = Join-Path $RT 'logs'
$PyDir = Join-Path $RT 'python'
$PgRoot = Join-Path $RT 'pgsql'
$PgBin = Join-Path $PgRoot 'bin'
$PgData = Join-Path $RT 'pgdata'
$WebDir = Join-Path $RT 'web'
$Py = Join-Path $PyDir 'python.exe'

$PyVersion = '3.11.9'
$PyUrl = "https://www.python.org/ftp/python/$PyVersion/python-$PyVersion-embed-amd64.zip"
$PipUrl = 'https://bootstrap.pypa.io/get-pip.py'
$PgUrl = 'https://get.enterprisedb.com/postgresql/postgresql-16.9-1-windows-x64-binaries.zip'
$ApiPort = 8800
$PgPort = 55432
$Base = "http://127.0.0.1:$ApiPort"
$Dsn = "postgresql://postgres@127.0.0.1:$PgPort/swappy"

function Say($m) { Write-Host "▶ $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "✖ $m" -ForegroundColor Red; exit 1 }

function Download($url, $dest) {
  for ($i = 1; $i -le 3; $i++) {
    try { Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing; return }
    catch { if ($i -eq 3) { Fail "내려받기에 실패했습니다: $url ($($_.Exception.Message))" }; Start-Sleep -Seconds 3 }
  }
}

function Test-Port($port) {
  $c = New-Object System.Net.Sockets.TcpClient
  try { $c.Connect('127.0.0.1', $port); return $true } catch { return $false } finally { $c.Close() }
}

function Stop-All {
  if (Test-Path (Join-Path $PgData 'postmaster.pid')) {
    $stop = Start-Process (Join-Path $PgBin 'pg_ctl.exe') -ArgumentList '-D', $PgData, 'stop', '-m', 'fast' -WindowStyle Hidden -PassThru
    $stop.WaitForExit(30000) | Out-Null
  }
  $pidFile = Join-Path $RT 'backend.pid'
  if (Test-Path $pidFile) {
    $p = [int](Get-Content $pidFile)
    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  }
}

if ($Action -eq 'stop') { Stop-All; Say '종료했습니다.'; exit 0 }
if ($Action -eq 'reset') {
  Say 'DB를 처음 상태로 되돌립니다.'
  Stop-All
  Remove-Item $PgData -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item (Join-Path $RT '.db_ready'), (Join-Path $RT '.seeded') -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Force $RT, $Logs | Out-Null
if ($Root -match '[^\x00-\x7F]' -or $Root -match '\s') {
  Write-Host "참고: 프로젝트 경로에 한글이나 공백이 있습니다($Root). 문제가 생기면 C:\swappy 처럼 영문 경로로 옮겨 보세요." -ForegroundColor Yellow
}

# ── 이미 실행 중이면 창만 다시 연다 ─────────────────────────────────
$Edge = @("$env:ProgramFiles (x86)\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
function Open-Window {
  if ($Edge) {
    $edgeProfile = Join-Path $RT 'edge'
    $proc = Start-Process $Edge -ArgumentList "--app=$Base", '--window-size=430,900', "--user-data-dir=$edgeProfile", '--no-first-run', '--disable-features=msEdgeSidebar' -PassThru
    return $proc
  }
  Start-Process $Base
  return $null
}
if ((Test-Port $ApiPort) -and (Test-Path (Join-Path $RT 'backend.pid'))) {
  Say '이미 실행 중입니다. 창만 다시 엽니다.'
  Open-Window | Out-Null
  exit 0
}
if (Test-Port $ApiPort) { Fail "포트 $ApiPort 를 다른 프로그램이 쓰고 있습니다. 종료한 뒤 다시 실행해 주세요." }
if ((Test-Port $PgPort) -and -not (Test-Path (Join-Path $PgData 'postmaster.pid'))) { Fail "포트 $PgPort 를 다른 프로그램이 쓰고 있습니다." }

# ── 1. 휴대용 Python ────────────────────────────────────────────────
if (-not (Test-Path (Join-Path $RT '.python_ready'))) {
  Say "Python $PyVersion 내려받는 중 (약 11MB)"
  $zip = Join-Path $RT 'python.zip'
  Download $PyUrl $zip
  Remove-Item $PyDir -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive $zip -DestinationPath $PyDir -Force
  Remove-Item $zip
  Say 'pip 설치 중'
  # embeddable 은 site-packages 를 기본으로 끄고 있다(_pth). 켜야 pip 로 설치한 패키지가 보인다.
  $pth = Get-ChildItem $PyDir -Filter 'python*._pth' | Select-Object -First 1
  (Get-Content $pth.FullName) -replace '^#\s*import site', 'import site' | Set-Content $pth.FullName -Encoding ASCII
  $getpip = Join-Path $RT 'get-pip.py'
  Download $PipUrl $getpip
  & $Py $getpip --no-warn-script-location 2>&1 | Out-File (Join-Path $Logs 'pip-bootstrap.log')
  if ($LASTEXITCODE -ne 0) { Fail 'pip 설치에 실패했습니다. .runtime\logs\pip-bootstrap.log 를 확인해 주세요.' }
  Remove-Item $getpip
  Say '백엔드 패키지 설치 중 (처음 한 번, 몇 분 걸립니다)'
  # 시연에 필요 없는 테스트·수집 도구는 뺀다
  $req = Join-Path $RT 'requirements.runtime.txt'
  # Windows 에는 시간대 데이터베이스가 없다(zoneinfo 'Asia/Seoul') — tzdata 를 함께 설치한다
  (Get-Content (Join-Path $Root 'backend\requirements.txt') | Where-Object { $_ -notmatch '^\s*(pytest|selenium|beautifulsoup4)' }) + 'tzdata' | Set-Content $req -Encoding UTF8
  & $Py -m pip install --no-warn-script-location --prefer-binary --only-binary=:all: -r $req 2>&1 | Out-File (Join-Path $Logs 'pip-install.log')
  if ($LASTEXITCODE -ne 0) { Fail '패키지 설치에 실패했습니다. .runtime\logs\pip-install.log 를 확인해 주세요.' }
  New-Item (Join-Path $RT '.python_ready') -ItemType File | Out-Null
}
& $Py -c "import zoneinfo; zoneinfo.ZoneInfo('Asia/Seoul')" 2>$null
if ($LASTEXITCODE -ne 0) {
  Say '시간대 데이터 설치'
  & $Py -m pip install --no-warn-script-location --quiet tzdata 2>&1 | Out-File (Join-Path $Logs 'pip-tzdata.log')
}
# embeddable 은 PYTHONPATH 와 현재 폴더를 무시한다 — 백엔드 폴더를 _pth 에 적어 둔다(저장소를 옮겨도 매번 갱신).
$pth = Get-ChildItem $PyDir -Filter 'python*._pth' | Select-Object -First 1
$lines = (Get-Content $pth.FullName) | Where-Object { $_ -notmatch 'swappy-backend' }
$lines + (Join-Path $Root 'backend') + '# swappy-backend' | Set-Content $pth.FullName -Encoding ASCII

# ── 2. 휴대용 Postgres ──────────────────────────────────────────────
if (-not (Test-Path (Join-Path $RT '.pg_ready'))) {
  Say 'PostgreSQL 내려받는 중 (약 315MB, 몇 분 걸립니다)'
  $zip = Join-Path $RT 'pgsql.zip'
  Download $PgUrl $zip
  Say 'PostgreSQL 압축 푸는 중'
  Remove-Item $PgRoot -Recurse -Force -ErrorAction SilentlyContinue
  $tmp = Join-Path $RT 'pg_extract'
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory $tmp | Out-Null
  & tar.exe -xf $zip -C $tmp
  if ($LASTEXITCODE -ne 0) { Fail 'PostgreSQL 압축 해제에 실패했습니다.' }
  Move-Item (Join-Path $tmp 'pgsql') $PgRoot
  Remove-Item $tmp -Recurse -Force
  Remove-Item $zip
  New-Item (Join-Path $RT '.pg_ready') -ItemType File | Out-Null
}

# ── 3. DB 초기화·복원 ───────────────────────────────────────────────
if (-not (Test-Path (Join-Path $PgData 'PG_VERSION'))) {
  Say 'DB 초기화'
  & (Join-Path $PgBin 'initdb.exe') -D $PgData -U postgres -A trust -E UTF8 --locale=C 2>&1 | Out-File (Join-Path $Logs 'initdb.log')
  if ($LASTEXITCODE -ne 0) { Fail 'DB 초기화에 실패했습니다. .runtime\logs\initdb.log 를 확인해 주세요.' }
  Add-Content (Join-Path $PgData 'postgresql.conf') @"

port = $PgPort
listen_addresses = '127.0.0.1'
max_connections = 60
shared_buffers = 256MB
fsync = off
synchronous_commit = off
full_page_writes = off
"@
  Remove-Item (Join-Path $RT '.db_ready'), (Join-Path $RT '.seeded') -Force -ErrorAction SilentlyContinue
}
if (-not (Test-Path (Join-Path $PgData 'postmaster.pid'))) {
  Say 'DB 시작'
  # pg_ctl 이나 파이프로 기다리면 기동된 postgres 가 핸들을 쥐고 있어 끝나지 않는다 — postgres 를 직접 띄우고 준비될 때까지 확인만 한다
  Start-Process (Join-Path $PgBin 'postgres.exe') -ArgumentList '-D', $PgData -WindowStyle Hidden `
    -RedirectStandardError (Join-Path $Logs 'postgres.log') -RedirectStandardOutput (Join-Path $Logs 'postgres.out.log') | Out-Null
  $up = $false
  for ($i = 0; $i -lt 60; $i++) {
    & (Join-Path $PgBin 'pg_isready.exe') -h 127.0.0.1 -p $PgPort *> $null
    if ($LASTEXITCODE -eq 0) { $up = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $up) { Fail 'DB를 시작하지 못했습니다. .runtime\logs\postgres.log 를 확인해 주세요.' }
}
if (-not (Test-Path (Join-Path $RT '.db_ready'))) {
  Say '제품 데이터 복원 중 (1~3분)'
  & (Join-Path $PgBin 'psql.exe') -h 127.0.0.1 -p $PgPort -U postgres -X -q -c 'drop database if exists swappy' -c 'create database swappy' 2>&1 | Out-Null
  # 40MB 로 나눠 올린 덤프를 이어 붙인다
  $dump = Join-Path $RT 'catalog.dump'
  $out = [System.IO.File]::Create($dump)
  try {
    foreach ($part in (Get-ChildItem (Join-Path $Root 'standalone') -Filter 'catalog.dump.part*' | Sort-Object Name)) {
      $bytes = [System.IO.File]::ReadAllBytes($part.FullName)
      $out.Write($bytes, 0, $bytes.Length)
    }
  } finally { $out.Close() }
  & (Join-Path $PgBin 'pg_restore.exe') -h 127.0.0.1 -p $PgPort -U postgres -d swappy --no-owner --no-privileges $dump 2>&1 | Out-File (Join-Path $Logs 'restore.log')
  & (Join-Path $PgBin 'pg_restore.exe') -h 127.0.0.1 -p $PgPort -U postgres -d swappy --no-owner --data-only (Join-Path $Root 'standalone\reviews.dump') 2>&1 | Out-File (Join-Path $Logs 'restore-reviews.log')
  Remove-Item $dump -Force
  $n = & (Join-Path $PgBin 'psql.exe') -h 127.0.0.1 -p $PgPort -U postgres -d swappy -X -At -c 'select count(*) from products'
  if ([int]$n -lt 1000) { Fail "제품 데이터 복원이 불완전합니다(제품 $n). .runtime\logs\restore.log 를 확인해 주세요." }
  New-Item (Join-Path $RT '.db_ready') -ItemType File | Out-Null
}

# ── 4. 화면 ─────────────────────────────────────────────────────────
$webZip = Join-Path $Root 'standalone\web.zip'
$stamp = (Get-Item $webZip).LastWriteTimeUtc.Ticks.ToString() + '-' + (Get-Item $webZip).Length
$stampFile = Join-Path $RT '.web_stamp'
if (-not (Test-Path (Join-Path $WebDir 'index.html')) -or -not (Test-Path $stampFile) -or ((Get-Content $stampFile) -ne $stamp)) {
  Say '화면 파일 준비'
  Remove-Item $WebDir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory $WebDir | Out-Null
  # Expand-Archive(Windows PowerShell 5.1)는 파일이 많은 압축에서 실패하는 일이 있어 tar.exe 를 쓴다
  & tar.exe -xf $webZip -C $WebDir
  if ($LASTEXITCODE -ne 0) { Fail '화면 파일 압축 해제에 실패했습니다.' }
  Set-Content $stampFile $stamp
}

# ── 5. 백엔드 ───────────────────────────────────────────────────────
Say '서버 시작'
$env:DATABASE_DSN = $Dsn
$env:APP_ENV = 'development'
$env:SECRET_KEY = 'standalone-local-secret-key'
$env:STATIC_DIR = $WebDir
$env:REDIS_HOST = '127.0.0.1'
$env:REDIS_PORT = '1'                          # 쓰지 않는다 — 연결이 바로 거절되고 캐시·요청 제한은 통과(fail-open)한다
$env:SKIN_ANALYSIS_ALLOWED_EMAILS = ''         # 얼굴 분석 외부 호출 없음 → 저장된 표본 분석
$env:SKIN_SAMPLE_EMAIL = 'eunseong@swappy.app'
$env:CORS_ORIGINS = $Base
$env:PYTHONIOENCODING = 'utf-8'
# 선택: .env.local 에 OPENAI_API_KEY 등을 적으면 챗봇 AI 답변이 켜진다(키 없이도 DB 기반 답변으로 동작)
$envLocal = Join-Path $Root '.env.local'
if (Test-Path $envLocal) {
  Get-Content $envLocal | Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*=' } | ForEach-Object {
    $k, $v = $_ -split '=', 2
    [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim().Trim('"'), 'Process')
  }
}
$backend = Start-Process $Py -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', $ApiPort `
  -WorkingDirectory (Join-Path $Root 'backend') -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $Logs 'backend.out.log') -RedirectStandardError (Join-Path $Logs 'backend.err.log')
Set-Content (Join-Path $RT 'backend.pid') $backend.Id
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  if ($backend.HasExited) { break }
  try { if ((Invoke-WebRequest "$Base/health" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { $ok = $true; break } } catch { Start-Sleep -Seconds 1 }
}
if (-not $ok) { Stop-All; Fail '서버가 시작되지 않았습니다. .runtime\logs\backend.err.log 를 확인해 주세요.' }

# ── 6. 시연 데이터 ──────────────────────────────────────────────────
if (-not (Test-Path (Join-Path $RT '.seeded'))) {
  Say '시연 계정과 데이터를 만드는 중 (1분 안팎)'
  & $Py (Join-Path $Root 'standalone\seed_demo.py') --base $Base --dsn $Dsn --pg-bin $PgBin 2>&1 | Tee-Object (Join-Path $Logs 'seed.log')
  if ($LASTEXITCODE -ne 0) { Stop-All; Fail '시연 데이터 준비에 실패했습니다. .runtime\logs\seed.log 를 확인해 주세요.' }
  New-Item (Join-Path $RT '.seeded') -ItemType File | Out-Null
}

# ── 7. 창 ───────────────────────────────────────────────────────────
Say "준비 완료: $Base  (데모 계정 eunseong@swappy.app / swappy1234, 창을 닫으면 종료됩니다)"
if ($env:SWAPPY_NO_WINDOW) {
  # 시험용: 창 없이 서버만 띄워 두고 .runtime\stop 파일이 생기면 종료한다
  while (-not (Test-Path (Join-Path $RT 'stop'))) { Start-Sleep -Seconds 2 }
  Remove-Item (Join-Path $RT 'stop') -Force
} else {
  $win = Open-Window
  if ($win) { Wait-Process -Id $win.Id -ErrorAction SilentlyContinue }
  else { Read-Host '종료하려면 Enter' | Out-Null }
}
Say '종료하는 중'
Stop-All
