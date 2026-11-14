# Space Apps dynamic agent worker onboarding, Windows PowerShell 5.1+
# Fetched from the team's private GitHub repository using an authenticated gh CLI.
# No credentials are embedded or exported to the repository.
[CmdletBinding()]
param(
    [ValidateSet('codex','claude')][string]$Provider = 'codex',
    [string]$AgentId = '',
    [string]$Capabilities = '',
    [ValidateSet('plan','code')][string]$Mode = 'plan',
    [string]$InstallDir = (Join-Path $HOME 'spaceapps'),
    [switch]$NoStart
)
$ErrorActionPreference = 'Stop'
$Repo = 'momansy/nasa-spaceapps-2026'
$Folder = 'nasa-spaceapps-2026'

function Say([string]$Message) { Write-Host "[SpaceApps] $Message" -ForegroundColor Cyan }
function Fail([string]$Message) { throw "[SpaceApps] $Message" }
function Refresh-Path {
    $paths = @(
        [Environment]::GetEnvironmentVariable('Path', 'Machine'),
        [Environment]::GetEnvironmentVariable('Path', 'User'),
        $env:Path,
        "$env:ProgramFiles\GitHub CLI",
        "$env:ProgramFiles\Git\cmd",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Links",
        "$env:LOCALAPPDATA\Programs\OpenAI\Codex\bin",
        "$env:LOCALAPPDATA\Programs\claude"
    ) | Where-Object { $_ }
    $env:Path = ($paths -join ';')
}
function Has-Tool([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}
function Install-Tool([string]$Command,[string]$Package) {
    if (Has-Tool $Command) { Say "$Command is installed"; return }
    if (-not (Has-Tool 'winget')) { Fail "Missing $Command and winget. Install Windows App Installer/winget, then re-run." }
    Say "Installing $Package with WinGet (you may see a Windows permission prompt)..."
    & winget install --id $Package --exact --source winget --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { Fail "WinGet installation failed for $Package (exit $LASTEXITCODE)" }
    Refresh-Path
    if (-not (Has-Tool $Command)) {
        Fail "$Command was installed but is not on PATH yet. Open a fresh PowerShell window and repeat the same command."
    }
}
function Get-PythonRunner {
    $ErrorActionPreference = 'Continue'
    $options = @(
        @{exe='py'; flags=@('-3.12')},
        @{exe='py'; flags=@('-3')},
        @{exe='python'; flags=@()},
        @{exe='python3'; flags=@()}
    )
    foreach ($option in $options) {
        if (-not (Has-Tool $option.exe)) { continue }
        $check = & $option.exe @($option.flags) -c "import sys; print('OK' if sys.version_info >= (3,10) else 'OLD')" 2>$null
        if ($LASTEXITCODE -eq 0 -and $check -eq 'OK') { return $option }
    }
    return $null
}
function Invoke-Python($Runner, [string[]]$ArgsList) {
    & $Runner.exe @($Runner.flags) @ArgsList
    if ($LASTEXITCODE -ne 0) { Fail "Python command failed (exit $LASTEXITCODE): $($ArgsList -join ' ')" }
}

Refresh-Path
if (-not (Has-Tool 'gh')) {
    Fail "GitHub CLI missing. Use the one-line launcher from the team's setup guide to install it and sign in."
}
Say 'Checking your personal GitHub login'
& gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    Say 'Sign in to your OWN GitHub account in the browser; do not share a teammate token.'
    & gh auth login --hostname github.com --git-protocol https --web
    if ($LASTEXITCODE -ne 0) { Fail 'GitHub login was not completed' }
}
$GitHubUser = (& gh api user --jq '.login').Trim()
if ($LASTEXITCODE -ne 0 -or -not $GitHubUser) { Fail 'Cannot read authenticated GitHub username' }
& gh api "repos/$Repo" --jq '.full_name' *> $null
if ($LASTEXITCODE -ne 0) {
    Fail "GitHub user $GitHubUser cannot access $Repo. Accept the invitation to the private repository and retry."
}
Say "Private repository access confirmed for @$GitHubUser"

if (-not $AgentId) {
    $AgentId = $GitHubUser.ToLowerInvariant() -replace '[^a-z0-9_-]','-'
    $AgentId = $AgentId.Substring(0, [Math]::Min($AgentId.Length, 24))
}
if ($AgentId -cnotmatch '^[a-z][a-z0-9_-]{1,23}$') {
    Fail 'AgentId must be 2-24 lowercase letters/digits/_/-, starting with a letter.'
}
# Each friend must use their own GitHub identity; the agent ID defaults to that login.
Say "Agent ID: $AgentId | Provider: $Provider | Mode: $Mode"
Install-Tool 'git' 'Git.Git'
if (-not (Get-PythonRunner)) {
    if (-not (Has-Tool 'winget')) { Fail 'Python 3.10+ not found, and winget is unavailable.' }
    Say 'Installing Python 3.12 with WinGet'
    & winget install --id Python.Python.3.12 --exact --source winget --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { Fail 'Python installation failed' }
    Refresh-Path
}
$Python = Get-PythonRunner
if (-not $Python) { Fail 'Python >= 3.10 was not detected after installation. Restart PowerShell and retry.' }
Install-Tool $Provider $(if ($Provider -eq 'codex') { 'OpenAI.Codex' } else { 'Anthropic.ClaudeCode' })

Say "Checking $Provider authentication"
if ($Provider -eq 'codex') { & codex login status *> $null } else { & claude auth status *> $null }
if ($LASTEXITCODE -ne 0) {
    Say "Please finish your personal $Provider login."
    if ($Provider -eq 'codex') { & codex login } else { & claude auth login }
    if ($LASTEXITCODE -ne 0) { Fail "$Provider login incomplete" }
}
if ($Provider -eq 'codex') { & codex login status *> $null } else { & claude auth status *> $null }
if ($LASTEXITCODE -ne 0) { Fail "No active $Provider login; please sign in and retry" }

& gh auth setup-git
if ($LASTEXITCODE -ne 0) { Fail 'Could not configure Git HTTPS credential helper' }
if (-not (Test-Path -LiteralPath $InstallDir)) { New-Item -Path $InstallDir -ItemType Directory -Force | Out-Null }
$LocalRepo = Join-Path $InstallDir $Folder
if (-not (Test-Path -LiteralPath $LocalRepo)) {
    Say "Cloning private repository into $LocalRepo"
    & gh repo clone $Repo $LocalRepo
    if ($LASTEXITCODE -ne 0) { Fail 'Repository clone failed' }
} else {
    if (-not (Test-Path -LiteralPath (Join-Path $LocalRepo '.git'))) {
        Fail "$LocalRepo already exists but is not a git checkout. Specify a different -InstallDir."
    }
    $origin = (& git -C $LocalRepo remote get-url origin).Trim()
    if ($origin -notmatch '(^|[/:])momansy/nasa-spaceapps-2026(\.git)?$') {
        Fail "Existing checkout has an unexpected origin ($origin); refusing to overwrite it."
    }
    Say 'Existing checkout detected; fast-forwarding only (no overwriting local changes)'
    & git -C $LocalRepo pull --ff-only
    if ($LASTEXITCODE -ne 0) { Fail 'Git pull failed; resolve local changes or divergence before rerunning.' }
}
$env:MESH_REPO = $Repo
Push-Location $LocalRepo
try {
    Say 'Initializing GitHub task labels (safe to run repeatedly)'
    Invoke-Python $Python @('mesh.py','bootstrap')
    Say 'Current mesh roster:'
    Invoke-Python $Python @('mesh.py','roster')
    if ($NoStart) {
        Say 'SETUP COMPLETE — worker was not started because -NoStart was supplied.'
        return
    }
    Say 'READY — starting persistent agent worker; keep this window open, Ctrl+C stops it.'
    $params = @('mesh.py','worker','--agent',$AgentId,'--provider',$Provider,'--mode',$Mode,'--path',$LocalRepo)
    if ($Capabilities) { $params += @('--capabilities',$Capabilities) }
    Invoke-Python $Python $params
} finally { Pop-Location }