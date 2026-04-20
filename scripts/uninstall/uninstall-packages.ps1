<#
.SYNOPSIS
    Uninstall @hiroleague/taskmanager from npm + bun globals and clean up orphan
    `hirotm` / `hirotaskmanager` shims left behind in known install roots.

.DESCRIPTION
    Runs the documented uninstall commands (npm/bun), then walks every known
    global install root (npm root -g, npm prefix -g, bun pm bin -g,
    $env:BUN_INSTALL\bin) and physically deletes any remaining shim files
    matching the two binary names. Verifies via `where.exe`.

    This script never touches `~\.taskmanager`. Use clean-profiles.ps1 for that.

.PARAMETER DryRun
    Print every external command and every file that would be deleted; change
    nothing on disk.

.PARAMETER Force
    Skip the "About to delete N files, continue?" prompt.

.EXAMPLE
    pwsh -File scripts/uninstall/uninstall-packages.ps1 -DryRun

.EXAMPLE
    pwsh -File scripts/uninstall/uninstall-packages.ps1 -Force
#>
[CmdletBinding()]
param(
    [switch] $DryRun,
    [switch] $Force
)

$ErrorActionPreference = 'Stop'

$PackageName = '@hiroleague/taskmanager'
$LegacyPackageName = 'taskmanager'
$BinNames = @('hirotm', 'hirotaskmanager')
$ShimExtensions = @('', '.cmd', '.ps1', '.exe')

function Write-Info($msg) { Write-Host "[info]  $msg" -ForegroundColor Cyan }
function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor White }
function Write-Ok($msg)   { Write-Host "[ok]    $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "[warn]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[error] $msg" -ForegroundColor Red }

function Invoke-External {
    # Runs an external command, captures stdout+stderr, never throws on non-zero
    # (uninstall commands legitimately return non-zero when nothing is installed).
    # NOTE: param name is $ArgList (not $Args) because $Args collides with the
    # automatic variable PowerShell exposes inside advanced functions, which
    # caused arguments to be silently dropped.
    param(
        [Parameter(Mandatory = $true)] [string] $File,
        [string[]] $ArgList = @(),
        [switch] $AllowMissing
    )
    $display = "$File $($ArgList -join ' ')"
    Write-Info "exec: $display"
    if ($DryRun) { return [pscustomobject]@{ ExitCode = 0; Output = '' } }

    try {
        $output = & $File @ArgList 2>&1 | Out-String
        $code = $LASTEXITCODE
        if ($output) { $output.TrimEnd() | Write-Host }
        return [pscustomobject]@{ ExitCode = $code; Output = $output }
    }
    catch {
        if ($AllowMissing) {
            Write-Warn2 "command unavailable: $File ($($_.Exception.Message))"
            return [pscustomobject]@{ ExitCode = 127; Output = '' }
        }
        Write-Err "failed to run '$display': $($_.Exception.Message)"
        throw
    }
}

function Get-ToolOutput {
    # Resolve a path-style value from a tool (e.g. `npm root -g`). Returns $null
    # on any failure rather than throwing - callers degrade gracefully.
    # NOTE: param name is $ArgList (not $Args) - see Invoke-External above.
    param([string] $File, [string[]] $ArgList)
    try {
        $merged = & $File @ArgList 2>&1
        if ($null -eq $merged) { return $null }
        $stdoutLines = @($merged | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } |
                                   ForEach-Object { $_.ToString() })
        if ($stdoutLines.Count -eq 0) { return $null }
        $joined = ($stdoutLines -join "`n").Trim()
        if (-not $joined) { return $null }
        return $joined
    }
    catch {
        Write-Warn2 "could not query '$File $($ArgList -join ' ')': $($_.Exception.Message)"
        return $null
    }
}

function Resolve-InstallRoots {
    $roots = [System.Collections.Generic.List[pscustomobject]]::new()

    $npmRoot = Get-ToolOutput -File 'npm' -ArgList @('root', '-g')
    if ($npmRoot) { $roots.Add([pscustomobject]@{ Kind = 'npm-modules'; Path = $npmRoot }) }

    $npmPrefix = Get-ToolOutput -File 'npm' -ArgList @('prefix', '-g')
    if ($npmPrefix) { $roots.Add([pscustomobject]@{ Kind = 'npm-shim';   Path = $npmPrefix }) }

    $bunBin = Get-ToolOutput -File 'bun' -ArgList @('pm', 'bin', '-g')
    if ($bunBin) { $roots.Add([pscustomobject]@{ Kind = 'bun-shim';     Path = $bunBin }) }

    if ($env:BUN_INSTALL) {
        $bunFallback = Join-Path $env:BUN_INSTALL 'bin'
        if (Test-Path $bunFallback) {
            $roots.Add([pscustomobject]@{ Kind = 'bun-shim-env'; Path = $bunFallback })
        }
    }

    # Deduplicate by normalized full path.
    $seen = @{}
    $unique = foreach ($r in $roots) {
        try { $full = (Resolve-Path -LiteralPath $r.Path -ErrorAction Stop).Path }
        catch { continue }
        if ($seen.ContainsKey($full)) { continue }
        $seen[$full] = $true
        [pscustomobject]@{ Kind = $r.Kind; Path = $full }
    }
    return $unique
}

function Find-OrphanShims {
    param([pscustomobject[]] $Roots)
    $hits = [System.Collections.Generic.List[pscustomobject]]::new()
    foreach ($root in $Roots) {
        foreach ($bin in $BinNames) {
            foreach ($ext in $ShimExtensions) {
                $candidate = Join-Path $root.Path ($bin + $ext)
                if (Test-Path -LiteralPath $candidate) {
                    $hits.Add([pscustomobject]@{
                        Kind = $root.Kind
                        Path = $candidate
                    })
                }
            }
        }
        # The npm-modules root may still contain the package directory itself
        # (e.g. when `npm uninstall` was skipped or only ran for the legacy name).
        if ($root.Kind -eq 'npm-modules') {
            $pkgDir = Join-Path $root.Path '@hiroleague\taskmanager'
            if (Test-Path -LiteralPath $pkgDir) {
                $hits.Add([pscustomobject]@{ Kind = 'npm-pkg-dir'; Path = $pkgDir })
            }
            $legacyDir = Join-Path $root.Path 'taskmanager'
            if (Test-Path -LiteralPath $legacyDir) {
                $hits.Add([pscustomobject]@{ Kind = 'npm-pkg-dir'; Path = $legacyDir })
            }
        }
    }
    return $hits
}

function Remove-PathSafe {
    param([string] $Path)
    if ($DryRun) { Write-Info "would delete: $Path"; return $true }
    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        if ($item.PSIsContainer) {
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        } else {
            Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
        }
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
# 1. Run package-manager uninstall commands.
# ----------------------------------------------------------------------------
Write-Step 'Uninstall via package managers'
Invoke-External -File 'npm' -ArgList @('uninstall', '-g', $PackageName)        -AllowMissing | Out-Null
Invoke-External -File 'npm' -ArgList @('uninstall', '-g', $LegacyPackageName)  -AllowMissing | Out-Null
Invoke-External -File 'npm' -ArgList @('rm',        '-g', $PackageName)        -AllowMissing | Out-Null  # covers `npm link`
Invoke-External -File 'bun' -ArgList @('remove',    '-g', $PackageName)        -AllowMissing | Out-Null

# ----------------------------------------------------------------------------
# 2. Discover install roots and find orphan shims.
# ----------------------------------------------------------------------------
Write-Step 'Discover install roots'
$roots = Resolve-InstallRoots
if (-not $roots -or $roots.Count -eq 0) {
    Write-Warn2 'no install roots resolved - npm and bun may both be missing.'
} else {
    foreach ($r in $roots) { Write-Info ("{0,-14} {1}" -f $r.Kind, $r.Path) }
}

Write-Step 'Scan for orphan shims and package directories'
$orphans = Find-OrphanShims -Roots $roots
if ($orphans.Count -eq 0) {
    Write-Ok 'no orphans found.'
} else {
    foreach ($o in $orphans) { Write-Warn2 ("{0,-14} {1}" -f $o.Kind, $o.Path) }
    if (Confirm-Action "About to delete $($orphans.Count) item(s). Continue?") {
        $failed = 0
        foreach ($o in $orphans) {
            if (-not (Remove-PathSafe -Path $o.Path)) { $failed++ }
        }
        if ($failed -gt 0) {
            Write-Err "$failed deletion(s) failed."
        }
    } else {
        Write-Warn2 'skipped deletion at user request.'
    }
}

# ----------------------------------------------------------------------------
# 3. Verify.
# ----------------------------------------------------------------------------
Write-Step 'Verify'
foreach ($bin in $BinNames) {
    # `where.exe` returns exit 0 when found, 1 when missing, and writes its
    # help text to stderr on bad invocations - check exit code, not output.
    $found = & where.exe $bin 2>$null
    if ($LASTEXITCODE -eq 0 -and $found) {
        Write-Warn2 "where.exe still resolves '$bin':"
        $found -split "`r?`n" | Where-Object { $_ } | ForEach-Object { Write-Host "  $_" }
    } else {
        Write-Ok "where.exe: '$bin' not found on PATH."
    }
}

$npmList = Get-ToolOutput -File 'npm' -ArgList @('list', '-g', '--depth=0', $PackageName)
if ($npmList -and ($npmList -match [regex]::Escape($PackageName))) {
    Write-Warn2 "npm still lists '$PackageName':`n$npmList"
} else {
    Write-Ok "npm: '$PackageName' not listed globally."
}

$bunList = Get-ToolOutput -File 'bun' -ArgList @('pm', 'ls', '-g')
if ($bunList -and ($bunList -match [regex]::Escape($PackageName))) {
    Write-Warn2 "bun still lists '$PackageName':`n$bunList"
} else {
    Write-Ok "bun: '$PackageName' not listed globally."
}

Write-Host ''
if ($DryRun) {
    Write-Info 'dry-run complete. No changes were made.'
} else {
    Write-Ok 'package cleanup complete.'
}
