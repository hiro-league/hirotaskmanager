<#
.SYNOPSIS
    Inspect or clean the user's ~/.taskmanager directory (profiles, skills,
    config, logs). Destructive operations are opt-in via explicit flags.

.DESCRIPTION
    With no flags, lists what currently lives under ~/.taskmanager and exits
    without changing anything. Use -Profiles to delete profile directories, or
    -Nuke to wipe the entire ~/.taskmanager folder.

    Before deleting any profile, this script attempts to stop the local server
    via `hirotm server stop --profile <name>` if `hirotm` is on PATH.

.PARAMETER Profiles
    Profile-deletion mode:
      All           - delete every directory under profiles\
      AllExceptDev  - delete every profile directory except 'dev'
      Named         - delete every profile not listed in -Keep

.PARAMETER Keep
    Comma-separated profile names to preserve when -Profiles Named is used.

.PARAMETER Nuke
    Delete the entire ~/.taskmanager folder (profiles + skills + config + logs).
    Always interactive: requires typing the literal word NUKE, even with -Force.

.PARAMETER DryRun
    Print every path that would be deleted; change nothing on disk.

.PARAMETER Force
    Skip the y/N prompt for -Profiles modes. Ignored by -Nuke (which always
    requires typing the literal word NUKE).

.NOTES
    Any running server detected via a profile's server.pid.json is always
    force-stopped before deletion. Use -DryRun to preview without acting.

.EXAMPLE
    pwsh -File scripts/uninstall/clean-profiles.ps1
    # Just lists what's there.

.EXAMPLE
    pwsh -File scripts/uninstall/clean-profiles.ps1 -Profiles AllExceptDev -DryRun

.EXAMPLE
    pwsh -File scripts/uninstall/clean-profiles.ps1 -Nuke
#>
[CmdletBinding()]
param(
    [ValidateSet('All', 'AllExceptDev', 'Named')]
    [string]   $Profiles,
    [string[]] $Keep = @(),
    [switch]   $Nuke,
    [switch]   $DryRun,
    [switch]   $Force
)
# NOTE: Running servers found via each profile's server.pid.json are ALWAYS
# force-stopped before deletion (Stop-Process -Force). This is by design - a
# half-deleted profile with a live server holding open SQLite handles is worse
# than a clean kill. Use -DryRun to see what would be stopped without acting.

$ErrorActionPreference = 'Stop'

function Write-Info($msg) { Write-Host "[info]  $msg" -ForegroundColor Cyan }
function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor White }
function Write-Ok($msg)   { Write-Host "[ok]    $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "[warn]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[error] $msg" -ForegroundColor Red }

# ----------------------------------------------------------------------------
# Resolve and harden the target path.
# ----------------------------------------------------------------------------
$homeDir = $HOME
if (-not $homeDir) { $homeDir = $env:USERPROFILE }
if (-not $homeDir) {
    Write-Err 'cannot resolve $HOME / $env:USERPROFILE.'
    exit 2
}
$tmRoot = Join-Path $homeDir '.taskmanager'
$tmRootFull = $null
try { $tmRootFull = [System.IO.Path]::GetFullPath($tmRoot) } catch {
    Write-Err "failed to normalize '$tmRoot': $($_.Exception.Message)"
    exit 2
}
$homeFull = [System.IO.Path]::GetFullPath($homeDir)

# Defense against env-var sabotage: refuse to act if the resolved root is not
# strictly under the user's home directory.
if (-not $tmRootFull.StartsWith($homeFull + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    Write-Err "refusing to operate: resolved '$tmRootFull' is not under home '$homeFull'."
    exit 2
}

if (-not (Test-Path -LiteralPath $tmRootFull)) {
    Write-Info "no '$tmRootFull' directory present. Nothing to do."
    exit 0
}

$profilesRoot = Join-Path $tmRootFull 'profiles'

function Get-Profiles {
    if (-not (Test-Path -LiteralPath $profilesRoot)) { return @() }
    return Get-ChildItem -LiteralPath $profilesRoot -Directory -Force -ErrorAction SilentlyContinue
}

function Show-Inventory {
    Write-Step "Inventory of $tmRootFull"
    $top = Get-ChildItem -LiteralPath $tmRootFull -Force -ErrorAction SilentlyContinue
    if (-not $top) { Write-Info '(empty)'; return }
    foreach ($entry in $top) {
        $tag = if ($entry.PSIsContainer) { 'dir ' } else { 'file' }
        Write-Host ("  {0}  {1}" -f $tag, $entry.Name)
    }

    $profs = Get-Profiles
    if ($profs.Count -gt 0) {
        Write-Host ''
        Write-Info "profiles ($($profs.Count)):"
        foreach ($p in $profs) { Write-Host "  - $($p.Name)" }
    }
}

function Get-RunningServerInfo {
    # Reads ~/.taskmanager/profiles/<name>/server.pid.json and returns
    # @{ Pid; Port; StartedAt; Process } if the recorded PID is alive,
    # otherwise $null. Stale pid files (process gone) are treated as not-running.
    param([string] $ProfileDir, [string] $ProfileName)
    $pidFile = Join-Path $ProfileDir 'server.pid.json'
    if (-not (Test-Path -LiteralPath $pidFile)) { return $null }
    try {
        $raw = Get-Content -LiteralPath $pidFile -Raw -ErrorAction Stop
        $rec = $raw | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        Write-Warn2 "could not parse '$pidFile' for profile '$ProfileName': $($_.Exception.Message)"
        return $null
    }
    if (-not $rec.pid) { return $null }
    $proc = Get-Process -Id $rec.pid -ErrorAction SilentlyContinue
    if (-not $proc) { return $null }
    return [pscustomobject]@{
        Pid       = [int]$rec.pid
        Port      = $rec.port
        StartedAt = $rec.startedAt
        Process   = $proc
        PidFile   = $pidFile
    }
}

function Stop-ServerForProfile {
    # Force-stops the server process recorded in the profile's pid file.
    # Returns $true on success or if nothing was running, $false on failure.
    param([string] $ProfileDir, [string] $ProfileName)
    $info = Get-RunningServerInfo -ProfileDir $ProfileDir -ProfileName $ProfileName
    if (-not $info) {
        Write-Info "profile '$ProfileName': no running server."
        return $true
    }
    Write-Info "profile '$ProfileName': stopping server PID $($info.Pid) (port $($info.Port))..."
    if ($DryRun) { return $true }
    try {
        Stop-Process -Id $info.Pid -Force -ErrorAction Stop
        # Give the OS a moment to release file handles before deletion.
        Start-Sleep -Milliseconds 500
        Write-Ok "profile '$ProfileName': stopped PID $($info.Pid)."
        return $true
    }
    catch {
        Write-Err "profile '$ProfileName': failed to stop PID $($info.Pid): $($_.Exception.Message)"
        return $false
    }
}

function Remove-PathSafe {
    param([string] $Path)
    if ($DryRun) { Write-Info "would delete: $Path"; return $true }
    try {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        Write-Ok "deleted: $Path"
        return $true
    }
    catch {
        Write-Err "failed to delete '$Path': $($_.Exception.Message)"
        return $false
    }
}

function Confirm-Action {
    param([string] $Question)
    if ($Force -or $DryRun) { return $true }
    $answer = Read-Host "$Question [y/N]"
    return ($answer -match '^(y|yes)$')
}

# ----------------------------------------------------------------------------
# Default: just inventory and exit.
# ----------------------------------------------------------------------------
if (-not $Profiles -and -not $Nuke) {
    Show-Inventory
    Write-Host ''
    Write-Info 'No action requested. Use -Profiles {All|AllExceptDev|Named} or -Nuke.'
    exit 0
}

if ($Profiles -and $Nuke) {
    Write-Err '-Profiles and -Nuke are mutually exclusive.'
    exit 2
}

Show-Inventory

# ----------------------------------------------------------------------------
# Profile deletion mode.
# ----------------------------------------------------------------------------
if ($Profiles) {
    $all = Get-Profiles
    if ($all.Count -eq 0) {
        Write-Info "no profiles found under '$profilesRoot'."
        exit 0
    }

    $keepSet = switch ($Profiles) {
        'All'          { @() }
        'AllExceptDev' { @('dev') }
        'Named'        {
            if ($Keep.Count -eq 0) {
                Write-Err '-Profiles Named requires -Keep <name1,name2,...>'
                exit 2
            }
            $Keep
        }
    }

    $targets = $all | Where-Object { $keepSet -notcontains $_.Name }
    if ($targets.Count -eq 0) {
        Write-Info 'nothing to delete after applying keep-list.'
        exit 0
    }

    Write-Step "Profiles to delete ($($targets.Count))"
    foreach ($t in $targets) { Write-Warn2 "  - $($t.Name)  ($($t.FullName))" }
    if ($keepSet.Count -gt 0) {
        Write-Info "keeping: $($keepSet -join ', ')"
    }

    # Pre-flight: detect running servers so the user sees what's about to die.
    Write-Step 'Pre-flight: scan for running servers'
    $running = @()
    foreach ($t in $targets) {
        $info = Get-RunningServerInfo -ProfileDir $t.FullName -ProfileName $t.Name
        if ($info) {
            Write-Warn2 "profile '$($t.Name)': server PID $($info.Pid) running on port $($info.Port) (started $($info.StartedAt)) - will be force-stopped"
            $running += [pscustomobject]@{ Profile = $t; Info = $info }
        }
    }
    if ($running.Count -eq 0) { Write-Ok 'no running servers in target set.' }

    if (-not (Confirm-Action 'Proceed with deletion?')) {
        Write-Warn2 'aborted at user request.'
        exit 0
    }

    $failed = 0
    foreach ($t in $targets) {
        if (-not (Stop-ServerForProfile -ProfileDir $t.FullName -ProfileName $t.Name)) {
            Write-Err "skipping '$($t.Name)' because server stop failed."
            $failed++
            continue
        }
        if (-not (Remove-PathSafe -Path $t.FullName)) { $failed++ }
    }

    if ($failed -gt 0) {
        Write-Err "$failed profile deletion(s) failed."
        exit 1
    }
    Write-Ok 'profile cleanup complete.'
    exit 0
}

# ----------------------------------------------------------------------------
# Nuke mode.
# ----------------------------------------------------------------------------
if ($Nuke) {
    Write-Step 'NUKE mode'
    Write-Warn2 "About to delete the ENTIRE folder: $tmRootFull"
    Write-Warn2 'This wipes profiles, skills, config, logs, and any DBs inside.'

    # Pre-flight: show what's running before asking for the NUKE confirmation.
    Write-Step 'Pre-flight: scan for running servers'
    $running = @()
    foreach ($p in Get-Profiles) {
        $info = Get-RunningServerInfo -ProfileDir $p.FullName -ProfileName $p.Name
        if ($info) {
            Write-Warn2 "profile '$($p.Name)': server PID $($info.Pid) running on port $($info.Port) - will be force-stopped"
            $running += [pscustomobject]@{ Profile = $p; Info = $info }
        }
    }
    if ($running.Count -eq 0) { Write-Ok 'no running servers.' }

    # Always require explicit typed confirmation, even with -Force.
    if (-not $DryRun) {
        $typed = Read-Host "Type the word NUKE (uppercase) to confirm"
        if ($typed -ne 'NUKE') {
            Write-Warn2 'aborted: confirmation phrase did not match.'
            exit 0
        }
    }

    foreach ($r in $running) {
        if (-not (Stop-ServerForProfile -ProfileDir $r.Profile.FullName -ProfileName $r.Profile.Name)) {
            Write-Err 'nuke aborted: could not stop a running server.'
            exit 1
        }
    }

    if (-not (Remove-PathSafe -Path $tmRootFull)) {
        Write-Err 'nuke failed.'
        exit 1
    }
    Write-Ok 'nuke complete.'
    exit 0
}
