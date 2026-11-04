# Stop whatever is listening on a local dev port (default 8000).
param([int]$Port = 8000)
$conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if (-not $conn) {
  Write-Host "Nothing listening on port $Port."
  exit 0
}
$pids = $conn.OwningProcess | Sort-Object -Unique
foreach ($pid in $pids) {
  Write-Host "Stopping PID $pid on port $Port..."
  Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
}
Write-Host "Done. Start fresh: python tools/dev_server.py"
