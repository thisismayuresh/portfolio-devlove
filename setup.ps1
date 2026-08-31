<#
.SYNOPSIS
    devlove — check the environment, optionally run the tests, and serve.

.DESCRIPTION
    There is no build step. The editor is plain ES modules and runs exactly as
    it is written, so this script only ever checks that you have what you need
    and starts a static server.

.EXAMPLE
    .\setup.ps1
    .\setup.ps1 -Serve
    .\setup.ps1 -Test -Serve -Port 3000
#>

[CmdletBinding()]
param(
    # Serve the editor when the checks pass.
    [switch] $Serve,

    # Run the unit tests and the browser test suite.
    [switch] $Test,

    # Port for -Serve.
    [int] $Port = 8080
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Write-Head($text) { Write-Host $text -ForegroundColor White }
function Write-Ok($text)   { Write-Host "  + $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  ! $text" -ForegroundColor Yellow }
function Write-Fail($text) { Write-Host "  x $text" -ForegroundColor Red; exit 1 }

# ------------------------------------------------------------------ checks --

Write-Head 'Checking the environment'

$python = $null
foreach ($candidate in @('python', 'python3', 'py')) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($command) { $python = $command.Source; break }
}
if ($python) {
    $version = & $python --version 2>&1
    Write-Ok "$version - for the bundled server"
} else {
    Write-Warn 'no Python found. Any static file server works instead; see the README.'
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $nodeMajor = [int](& node -p 'process.versions.node.split(".")[0]')
    if ($nodeMajor -ge 20) {
        Write-Ok "node $(& node -v) - for the tests"
    } else {
        Write-Warn "node $(& node -v) is older than v20; the test suites need v20+"
    }
} else {
    Write-Warn 'no Node found. Only the tests need it - the editor does not.'
}

Write-Ok 'no build step: js/, css/ and index.html are served as written'

# ------------------------------------------------------------------- tests --

if ($Test) {
    if (-not $node) { Write-Fail '-Test needs Node v20+' }

    Write-Head 'Unit tests'
    & node --test 'tests/unit/*.test.js'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Head 'Browser tests'
    & node tests/run-browser-tests.mjs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# ------------------------------------------------------------------- serve --

if ($Serve) {
    if (-not $python) { Write-Fail '-Serve needs Python 3.8+, or use any static server' }
    Write-Head "Serving on http://127.0.0.1:$Port/"
    & $python serve.py $Port
    exit $LASTEXITCODE
}

if (-not $Test) {
    Write-Head 'Ready'
    Write-Host '  Run:  .\setup.ps1 -Serve'
}
