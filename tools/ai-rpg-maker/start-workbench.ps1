$ErrorActionPreference = "Stop"

$toolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverScript = Join-Path $toolDir "run-workbench-server.ps1"
$appUrl = "http://127.0.0.1:43115/"
$healthUrl = "http://127.0.0.1:43115/health"

function Test-WorkbenchHealth {
    try {
        Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found in PATH. Please install Node.js first."
}

if (-not (Test-WorkbenchHealth)) {
    Start-Process powershell -WindowStyle Hidden -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", "`"$serverScript`""
    ) | Out-Null

    for ($attempt = 0; $attempt -lt 12; $attempt += 1) {
        Start-Sleep -Milliseconds 500
        if (Test-WorkbenchHealth) {
            break
        }
    }
}

Start-Process $appUrl | Out-Null
