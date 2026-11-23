$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dist = Join-Path $root 'dist'
[void](New-Item -ItemType Directory -Path $dist -Force)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archivePath = Join-Path $dist "civicai-project-$stamp.zip"

function Get-PackageFiles([string]$directory) {
    foreach ($item in Get-ChildItem -LiteralPath $directory -Force) {
        $relative = [IO.Path]::GetRelativePath($root, $item.FullName).Replace('\', '/')
        if ($item.PSIsContainer) {
            if ($item.Name -in @('.git', 'node_modules', 'dist', 'hold_faces')) { continue }
            if ($relative -eq 'ml/.venv' -or $relative.StartsWith('ml/.venv/') -or
                $relative -eq 'ml/data' -or $relative.StartsWith('ml/data/')) { continue }
            Get-PackageFiles $item.FullName
            continue
        }
        if ($relative -match '^\.env(?!\.example$|\.local\.example$)' -or
            $item.Name -in @('a.txt', 't.txt', 'u2.txt', 'fake.jpg', 'owner.jpg') -or
            $relative -like 'storage/uploads/*' -and $item.Name -ne '.htaccess') { continue }
        $item
    }
}

$files = Get-PackageFiles $root
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $files) {
        $entry = [IO.Path]::GetRelativePath($root, $file.FullName).Replace('\', '/')
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entry, [IO.Compression.CompressionLevel]::Optimal)
    }
} finally {
    $archive.Dispose()
}
Write-Output "Created safe project package: $archivePath"
