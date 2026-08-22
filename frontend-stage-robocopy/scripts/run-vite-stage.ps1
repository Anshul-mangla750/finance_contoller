param(
  [ValidateSet("dev", "build", "preview")]
  [string]$Command = "build",
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ViteArgs = @()
)

$ErrorActionPreference = "Stop"

$Source = (Resolve-Path (Get-Location)).Path
$RepoRoot = Split-Path $Source -Parent
$StageRoot = Join-Path $RepoRoot "frontend-stage"
$SourceNodeModules = Join-Path $Source "node_modules"
$StageNodeModules = Join-Path $StageRoot "node_modules"
$SourceDist = Join-Path $Source "dist"
$StageDist = Join-Path $StageRoot "dist"
$ViteBin = Join-Path $StageNodeModules "vite\bin\vite.js"

function Remove-Stage {
  if (Test-Path -LiteralPath $StageRoot) {
    Remove-Item -LiteralPath $StageRoot -Recurse -Force
  }
}

function Seed-Stage {
  Remove-Stage
  New-Item -ItemType Directory -Path $StageRoot | Out-Null

  Get-ChildItem -Force $Source | Where-Object { $_.Name -notin @("node_modules", "dist") } | ForEach-Object {
    Copy-Item -Recurse -Force $_.FullName $StageRoot
  }

  New-Item -ItemType Junction -Path $StageNodeModules -Target $SourceNodeModules | Out-Null
}

function Sync-StageBack {
  if (Test-Path -LiteralPath $StageDist) {
    Remove-Item -LiteralPath $SourceDist -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item -Recurse -Force $StageDist $SourceDist
  }
}

function Invoke-Vite {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Mode,
    [string[]]$Args = @()
  )

  Push-Location $StageRoot
  try {
    & node $ViteBin $Mode @Args
    return $LASTEXITCODE
  } finally {
    Pop-Location
  }
}

try {
  $ExitCode = 0
  switch ($Command) {
    "build" {
      Seed-Stage
      $ExitCode = Invoke-Vite -Mode "build" -Args $ViteArgs
      if ($ExitCode -eq 0) {
        Sync-StageBack
      }
    }
    "preview" {
      Seed-Stage
      $buildExit = Invoke-Vite -Mode "build"
      if ($buildExit -ne 0) {
        $ExitCode = $buildExit
        break
      }
      $ExitCode = Invoke-Vite -Mode "preview" -Args $ViteArgs
    }
    "dev" {
      Seed-Stage

      $syncJob = Start-Job -ArgumentList $Source, $StageRoot -ScriptBlock {
        param($SourcePath, $StagePath)
        $ErrorActionPreference = "SilentlyContinue"
        while ($true) {
          $null = & robocopy $SourcePath $StagePath /MIR /XD node_modules dist /R:0 /W:0 /NFL /NDL /NJH /NJS /NC /NS /NP
          Start-Sleep -Seconds 1
        }
      }

      try {
        $ExitCode = Invoke-Vite -Mode "dev" -Args $ViteArgs
      } finally {
        if ($syncJob) {
          Stop-Job $syncJob -Force -ErrorAction SilentlyContinue
          Remove-Job $syncJob -Force -ErrorAction SilentlyContinue
        }
      }
    }
  }
} finally {
  Remove-Stage
}

exit $ExitCode
