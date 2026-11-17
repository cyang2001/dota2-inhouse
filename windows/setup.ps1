$ErrorActionPreference = 'Stop'
$Project = Split-Path -Parent $PSScriptRoot
$LocalPython = Join-Path $env:LOCALAPPDATA 'Programs/Python/Python312/python.exe'
$Environment = Join-Path $Project '.venv'
$VenvPython = Join-Path $Environment 'Scripts/python.exe'
if (-not (Test-Path -LiteralPath $VenvPython)) {
    if (Test-Path -LiteralPath $LocalPython) {
        & $LocalPython -m venv $Environment
    } elseif (Get-Command py -ErrorAction SilentlyContinue) {
        py -3.12 -m venv $Environment
    } else {
        throw 'Install Python 3.12 first using winget install --id Python.Python.3.12 --exact --source winget --scope user'
    }
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python environment.' }
}
& $VenvPython -m pip install -e (Join-Path $Project 'analytics')
if ($LASTEXITCODE -ne 0) { throw 'Could not install the project dependencies.' }
& $VenvPython -m pip check
if ($LASTEXITCODE -ne 0) { throw 'Python dependency verification failed.' }
& $VenvPython --version
