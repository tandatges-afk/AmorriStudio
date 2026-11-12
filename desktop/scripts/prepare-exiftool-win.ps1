# Download a pinned ExifTool Windows binary for reproducible CI; never download at app runtime.
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$dest = Join-Path $root 'desktop/vendor/exiftool/win-x64'
if (Test-Path -LiteralPath $dest) {
    throw 'STOP: ExifTool vendor directory already exists; no overwrite'
}
$version = '13.61'
$sha256 = 'ab75b37515385a753aa60a58f68ffffe1ff81e43b319df9540978fb19e0580e5'
# Both endpoints serve the same official release file. Fail closed unless the
# complete ZIP matches the pinned SHA-256 published by the ExifTool project.
$uris = @(
    'https://downloads.sourceforge.net/project/exiftool/exiftool-13.61_64.zip',
    'https://sourceforge.net/projects/exiftool/files/exiftool-13.61_64.zip/download'
)
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('amorri-exiftool-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    $archive = Join-Path $tmp 'exiftool.zip'
    $verified = $false
    foreach ($uri in $uris) {
        if ($verified) { break }
        foreach ($attempt in 1..2) {
            Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
            try {
                Write-Host "Fetching pinned ExifTool 13.61 (endpoint $([array]::IndexOf($uris, $uri) + 1), attempt $attempt)"
                Invoke-WebRequest -Uri $uri -OutFile $archive -UseBasicParsing -TimeoutSec 90 -MaximumRedirection 10 -ErrorAction Stop
                if (!(Test-Path -LiteralPath $archive -PathType Leaf)) {
                    throw 'Response did not create a file'
                }
                $bytes = (Get-Item -LiteralPath $archive).Length
                if ($bytes -lt 1048576) {
                    throw "Invalid download size ($bytes bytes), likely an HTML error page"
                }
                # SourceForge may return an HTML redirect/error body with HTTP 200.
                # Reject such content *before* Expand-Archive.
                $stream = [IO.File]::OpenRead($archive)
                try {
                    $p = $stream.ReadByte()
                    $k = $stream.ReadByte()
                    $a = $stream.ReadByte()
                    $b = $stream.ReadByte()
                } finally { $stream.Dispose() }
                if ($p -ne 0x50 -or $k -ne 0x4b -or $a -ne 0x03 -or $b -ne 0x04) {
                    throw 'Response is not a ZIP archive (PK header missing)'
                }
                $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
                if ($actual -ne $sha256) {
                    throw "SHA-256 mismatch: got $actual (expected official pinned $sha256)"
                }
                $verified = $true
                Write-Host "OFFICIAL EXIFTOOL ZIP SHA256: PASS ($actual)"
                break
            } catch {
                Write-Warning "ExifTool download candidate rejected: $($_.Exception.Message)"
            }
        }
    }
    if (-not $verified) {
        throw 'STOP: No endpoint returned the expected ExifTool 13.61 ZIP with official SHA-256. Staging blocked.'
    }
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
