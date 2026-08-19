<#
.SYNOPSIS
    Forge setup for Windows.

.DESCRIPTION
    Installs everything the project needs, builds the WebAssembly engine, and
    optionally serves the editor. Safe to re-run: every step checks first and
    skips what is already in place.

.PARAMETER Serve
    Start the local server once the build finishes.

.PARAMETER Port
    Port for -Serve. Defaults to 8080.

.PARAMETER Dev
    Fast unoptimised build (skips wasm-opt).

.PARAMETER Test
    Run the Rust unit tests and the headless browser suite.

.PARAMETER Yes
    Never prompt. Intended for CI.

.EXAMPLE
    .\setup.ps1
.EXAMPLE
    .\setup.ps1 -Serve -Port 3000
.EXAMPLE
    .\setup.ps1 -Test

.NOTES
    The Linux/macOS equivalent is setup.sh.
    If PowerShell blocks this script, run it once as:
        powershell -ExecutionPolicy Bypass -File .\setup.ps1
#>

[CmdletBinding()]
param(
    [switch]$Serve,
    [int]$Port = 8080,
    [switch]$Dev,
    [switch]$Test,
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

# ------------------------------------------------------------------ output --

function Write-Step { param([string]$Text) Write-Host "`n==> $Text" -ForegroundColor Blue }
function Write-Ok   { param([string]$Text) Write-Host "    [ok] $Text" -ForegroundColor Green }
function Write-Info { param([string]$Text) Write-Host "    $Text" -ForegroundColor DarkGray }
function Write-Warn { param([string]$Text) Write-Host "    [!]  $Text" -ForegroundColor Yellow }

function Stop-WithError {
    param([string]$Text)
    Write-Host "`nerror: $Text" -ForegroundColor Red
    exit 1
}

function Test-Have {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Confirm-Action {
    param([string]$Question)
    if ($Yes) { return $true }
    $answer = Read-Host "    [?]  $Question [y/N]"
    return ($answer -match '^(y|yes)$')
}

# Prepends cargo's bin directory so a freshly installed toolchain is usable
# without opening a new terminal.
function Add-CargoToPath {
    $cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
    if ((Test-Path $cargoBin) -and ($env:PATH -notlike "*$cargoBin*")) {
        $env:PATH = "$cargoBin;$env:PATH"
    }
}

# ------------------------------------------------------------- environment --

Write-Step 'Checking the environment'
Write-Info ("Windows {0} / {1}" -f [System.Environment]::OSVersion.Version, $env:PROCESSOR_ARCHITECTURE)

Add-CargoToPath

# The default Rust toolchain on Windows targets MSVC and needs its linker.
$hasLinker = $false
$vsRoots = @(
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio",
    "${env:ProgramFiles}\Microsoft Visual Studio"
) | Where-Object { Test-Path $_ }

foreach ($root in $vsRoots) {
    if (Get-ChildItem -Path $root -Recurse -Filter 'link.exe' -ErrorAction SilentlyContinue |
        Select-Object -First 1) {
        $hasLinker = $true
        break
    }
}

if ($hasLinker) {
    Write-Ok 'MSVC build tools present'
}
else {
    Write-Warn 'Visual Studio Build Tools (MSVC linker) were not found.'
    Write-Info 'Rust needs them to link host binaries such as wasm-pack.'
    Write-Info 'Install with:'
    Write-Info '  winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"'
    Write-Info 'Alternatively use the GNU toolchain: rustup default stable-x86_64-pc-windows-gnu'
    if (-not (Confirm-Action 'Continue anyway?')) {
        Stop-WithError 'MSVC build tools missing'
    }
}

# --------------------------------------------------------------------- Rust --

Write-Step 'Rust toolchain'

if (Test-Have 'cargo') {
    Write-Ok (rustc --version)
}
else {
    Write-Warn 'Rust is not installed.'
    if (-not (Confirm-Action 'Install the Rust toolchain?')) {
        Stop-WithError 'Rust is required. Install it from https://rustup.rs and re-run.'
    }

    if (Test-Have 'winget') {
        Write-Info 'winget install --id Rustlang.Rustup -e'
        winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements --disable-interactivity --silent
    }
    else {
        $installer = Join-Path $env:TEMP 'rustup-init.exe'
        Write-Info 'Downloading rustup-init.exe from https://win.rustup.rs'
        Invoke-WebRequest -Uri 'https://win.rustup.rs/x86_64' -OutFile $installer -UseBasicParsing
        & $installer -y --no-modify-path
    }

    Add-CargoToPath
    if (-not (Test-Have 'cargo')) {
        Stop-WithError 'Rust installed but cargo is not on PATH. Open a new terminal and re-run.'
    }
    Write-Ok (rustc --version)
}

# ------------------------------------------------------------- wasm target --

Write-Step 'WebAssembly target'

$installed = rustup target list --installed
if ($installed -contains 'wasm32-unknown-unknown') {
    Write-Ok 'wasm32-unknown-unknown already installed'
}
else {
    Write-Info 'Adding wasm32-unknown-unknown...'
    rustup target add wasm32-unknown-unknown
    if ($LASTEXITCODE -ne 0) { Stop-WithError 'could not add the wasm32 target' }
    Write-Ok 'wasm32-unknown-unknown installed'
}

# --------------------------------------------------------------- wasm-pack --

Write-Step 'wasm-pack'

if (Test-Have 'wasm-pack') {
    Write-Ok (wasm-pack --version)
}
else {
    Write-Warn 'wasm-pack is not installed.'
    if (-not (Confirm-Action 'Build and install wasm-pack with cargo? (takes a few minutes)')) {
        Stop-WithError 'wasm-pack is required. See https://rustwasm.github.io/wasm-pack/'
    }
    cargo install wasm-pack --locked
    if ($LASTEXITCODE -ne 0) { Stop-WithError 'cargo install wasm-pack failed' }
    Add-CargoToPath
    Write-Ok (wasm-pack --version)
}

# ------------------------------------------------------------------- build --

Write-Step 'Building the engine'

if ($Dev) {
    Write-Info 'wasm-pack build --target web --dev'
    wasm-pack build --target web --dev
}
else {
    Write-Info 'wasm-pack build --target web'
    wasm-pack build --target web
}
if ($LASTEXITCODE -ne 0) { Stop-WithError 'the build failed (see the output above)' }

if (-not (Test-Path 'pkg\designer_engine.js')) {
    Stop-WithError 'build finished but pkg\designer_engine.js is missing'
}
$wasmSize = [math]::Round((Get-Item 'pkg\designer_engine_bg.wasm').Length / 1KB)
Write-Ok "pkg\ is ready ($wasmSize KB wasm)"

# ------------------------------------------------------------------- python --

$python = $null
foreach ($candidate in @('python', 'python3', 'py')) {
    if (Test-Have $candidate) { $python = $candidate; break }
}

# -------------------------------------------------------------------- tests --

if ($Test) {
    Write-Step 'Running tests'
    cargo test
    if ($LASTEXITCODE -ne 0) { Stop-WithError 'Rust tests failed' }
    Write-Ok 'Rust unit tests passed'

    if ((Test-Have 'node') -and $python) {
        node tests\run-browser-tests.mjs
        if ($LASTEXITCODE -ne 0) { Stop-WithError 'browser tests failed' }
        Write-Ok 'Browser tests passed'
    }
    else {
        Write-Warn 'Skipping browser tests (needs Node 22+ and Python on PATH)'
    }
}

# -------------------------------------------------------------------- serve --

if ($Serve) {
    if (-not $python) {
        Stop-WithError 'Python 3 is required to serve. Install it, or use any static file server.'
    }
    Write-Step 'Serving'
    & $python serve.py $Port
    exit $LASTEXITCODE
}

Write-Step 'Done'
if ($python) {
    Write-Host "    Start the editor with:  $python serve.py" -ForegroundColor White
}
else {
    Write-Host '    Serve this folder over HTTP and open index.html.' -ForegroundColor White
}
Write-Host "    Rebuild after editing src\:  wasm-pack build --target web`n" -ForegroundColor White
