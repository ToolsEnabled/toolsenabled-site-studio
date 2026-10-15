# Isolated qualification only until native Windows receipts are complete.
param([Parameter(Mandatory=$true)][string]$Site,[Parameter(Mandatory=$true)][string]$DataDirectory,[string]$Prefix,[switch]$EnableWindowsCandidate)
$ErrorActionPreference='Stop'
if(-not $EnableWindowsCandidate){throw 'Windows remains unqualified. Use -EnableWindowsCandidate only for an isolated qualification run.'}
if(-not [Environment]::Is64BitOperatingSystem){throw 'Windows candidate requires a 64-bit OS'}
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$OutputEncoding=New-Object Text.UTF8Encoding($false)
$source=[IO.Path]::GetFullPath($PSScriptRoot)
$manifest=Join-Path $source 'MANIFEST.sha256'
if(-not (Test-Path -LiteralPath $manifest -PathType Leaf)){throw 'Install from the checksum-verified extracted release ZIP, which includes MANIFEST.sha256.'}
if(-not $Prefix){$Prefix=Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) 'ToolsEnabled\SiteStudio\0.1.11'}
$node=(Get-Command node.exe -CommandType Application -ErrorAction Stop|Select-Object -First 1).Source
$major=[int]((& $node -p 'process.versions.node.split(".")[0]').Trim())
if($LASTEXITCODE -ne 0 -or $major -lt 22){throw 'Node.js 22 or newer required'}
$helper=Join-Path $source 'src\windows-private.ps1'
$ps=Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell\v1.0\powershell.exe'
function Native-Operation([string]$operation,[string]$target){
 $request=@{operation=$operation;path=$target}|ConvertTo-Json -Compress
 $answer=$request|& $ps -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper
 if($LASTEXITCODE -ne 0){throw 'Native folder custody refused; nothing existing was repaired'}
 $receipt=$answer|ConvertFrom-Json
 if($receipt.schema -ne 'site-studio/windows-custody/1' -or $receipt.ok -ne $true){throw 'Invalid native custody receipt'}
 return $receipt
}
# Canonicalize before overlap checks or writes. A missing target is resolved
# through its nearest existing ancestor; all such ancestors are custody checked.
$Prefix=(Native-Operation 'canonical' $Prefix).path
$DataDirectory=(Native-Operation 'canonical' $DataDirectory).path
$Site=(Native-Operation 'canonical' $Site).path
$source=(Native-Operation 'canonical' $source).path
foreach($value in @($Prefix,$DataDirectory,$Site)){if($value.Length -gt 200){throw 'Use paths no longer than 200 characters'}}
function Contains-Path([string]$a,[string]$b){return $a.Equals($b,[StringComparison]::OrdinalIgnoreCase) -or $a.StartsWith($b.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)}
$all=@($Prefix,$DataDirectory,$Site,$source)
for($i=0;$i -lt $all.Count;$i++){for($j=$i+1;$j -lt $all.Count;$j++){if((Contains-Path $all[$i] $all[$j]) -or (Contains-Path $all[$j] $all[$i])){throw 'Install, state, source and extracted archive paths must be separate'}}}
if((Test-Path -LiteralPath $Prefix) -or (Test-Path -LiteralPath $DataDirectory)){throw 'Choose new install and state folders; existing entries are never replaced or ACL-repaired'}
if(-not (Test-Path -LiteralPath $Site -PathType Container)){throw 'Site folder must already exist'}
[void](Native-Operation 'path-tree' $source)
[void](Native-Operation 'path-tree' $Site)
$files=New-Object 'Collections.Generic.List[string]'
$seen=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
foreach($line in Get-Content -LiteralPath $manifest){
 if($line.Length -lt 67){throw 'Malformed archive checksum list'}
 $expected=$line.Substring(0,64);$relative=$line.Substring(66)
 if([IO.Path]::IsPathRooted($relative) -or $relative.Contains('\') -or $relative.Split('/') -contains '..' -or $relative.Split('/') -contains '.' -or $relative.Contains(':') -or -not $seen.Add($relative)){throw 'Unsafe archive member'}
 if((Join-Path $Prefix $relative).Length -gt 240){throw 'Install prefix is too long for this payload'}
 $file=Join-Path $source $relative
 if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $expected){throw ('Archive member checksum differs: '+$relative)}
 $files.Add($relative)
}
[void](Native-Operation 'directory' $Prefix)
[void](Native-Operation 'directory' $DataDirectory)
foreach($relative in $files){
 $target=Join-Path $Prefix $relative;$parent=Split-Path -Parent $target
 [void][IO.Directory]::CreateDirectory($parent)
 Copy-Item -LiteralPath (Join-Path $source $relative) -Destination $target
}
Copy-Item -LiteralPath $manifest -Destination (Join-Path $Prefix 'MANIFEST.sha256')
[void](Native-Operation 'inspect-tree' $Prefix)
[void](Native-Operation 'inspect-tree' $DataDirectory)
'Installed an UNQUALIFIED native Windows candidate. No host settings changed. Keep all test evidence.'
@{mcpServers=@{'site-studio'=@{command=$node;args=@((Join-Path $Prefix 'mcp-web.js'),'--site',$Site,'--data-dir',$DataDirectory);env=@{SystemRoot=$env:SystemRoot;SITE_STUDIO_WINDOWS_CANDIDATE='1'}}}}|ConvertTo-Json -Depth 6
