<#
.SYNOPSIS
  Reads the HITL ESP32's serial log. Finds the board, restarts it so the
  start-up lines are included, and prints what it says for a number of seconds.

.EXAMPLE
  .\serial-log.ps1 -Seconds 75
  .\serial-log.ps1 -Seconds 15 -NoReset -Port COM9
#>
param(
  [int]$Seconds = 75,
  [string]$Port = "",
  [int]$Baud = 115200,
  [switch]$NoReset
)

$ErrorActionPreference = "Stop"
$cli = "$env:ProgramFiles\Arduino CLI\arduino-cli.exe"

if (-not $Port) {
  if (-not (Test-Path $cli)) { throw "arduino-cli not found at $cli. Pass -Port COMx instead." }
  $line = & $cli board list | Select-String 'Serial Port \(USB\)' | Select-Object -First 1
  if (-not $line) { throw "No USB serial board found. Check the cable (data, not charge-only) and run: arduino-cli board list" }
  $Port = ($line.ToString() -split '\s+')[0]
}
Write-Host "Reading $Port at $Baud baud for $Seconds s$(if (-not $NoReset) { ', after a restart' })"

$sp = New-Object System.IO.Ports.SerialPort $Port, $Baud, None, 8, One
$sp.ReadTimeout = 500
try {
  $sp.Open()
} catch {
  throw "Could not open $Port. Another program (a serial monitor, Arduino IDE, another session) is probably using it. $($_.Exception.Message)"
}
try {
  if (-not $NoReset) {
    # EN is wired to RTS on ESP32 DevKits: pulse it to restart the board. DTR low keeps it out of download mode.
    $sp.DtrEnable = $false
    $sp.RtsEnable = $true
    Start-Sleep -Milliseconds 120
    $sp.RtsEnable = $false
  }
  $end = (Get-Date).AddSeconds($Seconds)
  $buffer = ""
  while ((Get-Date) -lt $end) {
    try { $buffer += $sp.ReadExisting() } catch {}
    $parts = $buffer -split "`n"
    $buffer = $parts[-1]
    foreach ($l in $parts[0..($parts.Length - 2)]) { if ($l.Trim()) { Write-Output $l.TrimEnd("`r") } }
    Start-Sleep -Milliseconds 200
  }
  if ($buffer.Trim()) { Write-Output $buffer }
} finally {
  $sp.Close()
}
