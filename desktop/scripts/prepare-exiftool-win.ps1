# Download a pinned ExifTool Windows binary for reproducible CI; never download at app runtime.
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$dest = Join-Path $root 'desktop/vendor/exiftool/win-x64'
if (Test-Path -LiteralPath $dest) {
    throw 'STOP: ExifTool vendor directory already exists; no overwrite'
}
$version = '13.61'
$sha256 = 'ab75b37515385a753aa60a58f68ffffe1ff81e43b319df9540978fb19e0580e5'
$uri = 'https://sourceforge.net/projects/exiftool/files/exiftool-13.61_64.zip/download'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('amorri-exiftool-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    $archive = Join-Path $tmp 'exiftool.zip'
    Invoke-WebRequest -Uri $uri -OutFile $archive -UseBasicParsing -TimeoutSec 120
    $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $sha256) { throw 'STOP: Official distribution SHA256 mismatch. Do not use the download.' }
    $unpacked = Join-Path $tmp 'unpacked'
    Expand-Archive -LiteralPath $archive -DestinationPath $unpacked
    $candidate = Get-ChildItem $unpacked -Recurse -File | Where-Object { $_.Name -in @('exiftool(-k).exe','exiftool.exe') } | Select-Object -First 1
    if (-not $candidate) { throw 'STOP: ExifTool executable missing in verified ZIP' }
    $dep = Join-Path $candidate.DirectoryName 'exiftool_files'
    if (!(Test-Path -LiteralPath $dep -PathType Container)) { throw 'STOP: exiftool_files missing' }
    if (!(Test-Path -LiteralPath (Join-Path $dep 'LICENSE'))) { throw 'STOP: ExifTool license is missing' }
    $stage = Join-Path $tmp 'stage'
    New-Item -ItemType Directory -Path $stage | Out-Null
    Copy-Item -LiteralPath $candidate.FullName -Destination (Join-Path $stage 'exiftool.exe')
    Copy-Item -LiteralPath $dep -Destination (Join-Path $stage 'exiftool_files') -Recurse
    $v = @(& (Join-Path $stage 'exiftool.exe') -ver)
    if ($LASTEXITCODE -ne 0 -or (($v -join '').Trim() -ne $version)) { throw 'STOP: Wrong ExifTool runtime version' }
    $parent = Split-Path $dest -Parent
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    Move-Item -LiteralPath $stage -Destination $dest
    Write-Host 'EXIFTOOL PINNED WINDOWS STAGING: PASS'
} finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
