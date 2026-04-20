<#
.SYNOPSIS
    Orchestrator: runs uninstall-packages.ps1, then optionally clean-profiles.ps1.

.PARAMETER AlsoProfiles
    Forwards to clean-profiles.ps1 -Profiles. One of: All, AllExceptDev, Named.

.PARAMETER Keep
    Forwards to clean-profiles.ps1 -Keep when -AlsoProfiles Named is used.

.PARAMETER AlsoNuke
    Forwards to clean-profiles.ps1 -Nuke (always interactive).

.PARAMETER DryRun
.PARAMETER Force
    Forwarded to both child scripts.

.EXAMPLE
    pwsh -File scripts/uninstall/uninstall.ps1 -DryRun

.EXAMPLE
    pwsh -File scripts/uninstall/uninstall.ps1 -AlsoProfiles AllExceptDev -Force
#>
[CmdletBinding()]
param(
    [ValidateSet('All', 'AllExceptDev', 'Named')]
    [string]   $AlsoProfiles,
    [string[]] $Keep = @(),
    [switch]   $AlsoNuke,
    [switch]   $DryRun,
    [switch]   $Force
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$pkgArgs = @{}
if ($DryRun) { $pkgArgs.DryRun = $true }
if ($Force)  { $pkgArgs.Force  = $true }

& (Join-Path $here 'uninstall-packages.ps1') @pkgArgs
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    Write-Host "[error] uninstall-packages.ps1 exited with $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}

if ($AlsoProfiles -and $AlsoNuke) {
    Write-Host '[error] -AlsoProfiles and -AlsoNuke are mutually exclusive.' -ForegroundColor Red
    exit 2
}

if ($AlsoProfiles) {
    $profArgs = @{ Profiles = $AlsoProfiles }
    if ($Keep.Count -gt 0) { $profArgs.Keep = $Keep }
    if ($DryRun) { $profArgs.DryRun = $true }
    if ($Force)  { $profArgs.Force  = $true }
    & (Join-Path $here 'clean-profiles.ps1') @profArgs
    exit $LASTEXITCODE
}

if ($AlsoNuke) {
    $nukeArgs = @{ Nuke = $true }
    if ($DryRun) { $nukeArgs.DryRun = $true }
    & (Join-Path $here 'clean-profiles.ps1') @nukeArgs
    exit $LASTEXITCODE
}
