$ErrorActionPreference = "Stop"

$toolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $toolDir

node ".\server.mjs"
