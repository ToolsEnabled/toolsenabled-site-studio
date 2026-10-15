# One bounded operation. No repair of existing ACLs, no credentials or network.
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$env:PSModulePath="$PSHOME\Modules"
$request=[Console]::In.ReadToEnd()
if($request.Length -gt 16384){throw 'Request too large'}
# Windows PowerShell 5.1 may put one UTF-8 transport marker on native stdin.
# Do not trim additional or interior markers, or change the original size bound.
if($request.Length -gt 0 -and $request[0] -eq [char]0xfeff){$request=$request.Substring(1)}
$request=$request|ConvertFrom-Json
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$trusted=@($sid,'S-1-5-18','S-1-5-32-544')
$trustedOwners=$trusted+@('S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
function Check-Path([string]$value){
  if($value.Length -lt 3 -or $value[1] -ne ':' -or $value[2] -notin @('\','/')){throw 'Absolute local drive path required'}
  foreach($part in $value.Replace('/','\').Substring(3).Split('\')){
    if(-not $part -or $part -in @('.','..')){continue}
    $stem=$part.Split('.')[0].ToUpperInvariant()
    if($part.Contains(':') -or $part.EndsWith(' ') -or $part.EndsWith('.') -or $stem -in @('CON','PRN','AUX','NUL','CONIN$','CONOUT$') -or $stem -match '^(COM|LPT)[1-9¹²³]$'){throw 'Ambiguous Windows path refused'}
  }
  $full=[IO.Path]::GetFullPath($value)
  if($full.Length -gt 240 -or $full.StartsWith('\\') -or [IO.Path]::GetPathRoot($full).Length -ne 3){throw 'Local drive path required'}
  $drive=New-Object IO.DriveInfo([IO.Path]::GetPathRoot($full))
  if($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -ne 'NTFS'){throw 'Local NTFS required'}
  return $full
}
function Check-Entry([string]$value,[bool]$private,[bool]$ancestor){
  $attributes=[IO.File]::GetAttributes($value)
  if(([int]$attributes -band [int][IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Reparse point refused'}
  $acl=Get-Acl -LiteralPath $value
  $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  if($private -and $owner -ne $sid){throw 'Private entry owner differs'}
  if($ancestor -and $trustedOwners -notcontains $owner){throw 'Ancestor owner is not trusted'}
  $raw=New-Object Security.AccessControl.RawSecurityDescriptor($acl.GetSecurityDescriptorBinaryForm(),0)
  if($null -eq $raw.DiscretionaryAcl){throw 'Null DACL refused'}
  foreach($ace in $raw.DiscretionaryAcl){
    if($ace.AceType -eq [Security.AccessControl.AceType]::AccessDenied){continue}
    if($ace.AceType -ne [Security.AccessControl.AceType]::AccessAllowed){throw 'Unknown DACL grant refused'}
    if($trusted -contains $ace.SecurityIdentifier.Value){continue}
    if($private){throw 'Private entry grants another principal access'}
    # Windows PowerShell 5.1 cannot reliably apply -band to byte-backed enums.
    if(([int]$ace.AceFlags -band [int][Security.AccessControl.AceFlags]::InheritOnly) -eq 0 -and ([int64]$ace.AccessMask -band [int64]0x500D0140)){throw 'Ancestor replacement rights refused'}
  }
}
function Check-Parents([string]$value){
  $parents=New-Object 'Collections.Generic.List[string]'
  $current=[IO.Path]::GetDirectoryName($value)
  while($current){$parents.Add($current);$next=[IO.Path]::GetDirectoryName($current);if($next -eq $current){break};$current=$next}
  for($i=$parents.Count-1;$i -ge 0;$i--){if([IO.Directory]::Exists($parents[$i])){Check-Entry $parents[$i] $false $true}}
}
function New-Security([bool]$directory){
  $security=if($directory){New-Object Security.AccessControl.DirectorySecurity}else{New-Object Security.AccessControl.FileSecurity}
  $security.SetOwner((New-Object Security.Principal.SecurityIdentifier($sid)))
  $security.SetAccessRuleProtection($true,$false)
  foreach($principal in $trusted){
    $inherit=if($directory){[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}else{[Security.AccessControl.InheritanceFlags]::None}
    $rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($principal)),[Security.AccessControl.FileSystemRights]::FullControl,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
    [void]$security.AddAccessRule($rule)
  }
  return $security
}
if($request.operation -eq 'identity'){
  @{schema='site-studio/windows-custody/1';ok=$true;sid=$sid;localAppData=[Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)}|ConvertTo-Json -Compress
  exit 0
}
$target=Check-Path $request.path
Check-Parents $target
# Expand the nearest existing ancestor before comparing install paths, including
# 8.3 aliases. Failure is a refusal, never a fallback to lexical comparison.
if($request.operation -eq 'canonical'){
 Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class SiteStudioLongPath {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFileW(string path,uint access,uint sharing,IntPtr security,uint mode,uint flags,IntPtr template);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(IntPtr handle,StringBuilder output,uint size,uint flags);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 public static string Expand(string input){
  var h=CreateFileW(input,0x80,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
  if(h==new IntPtr(-1))throw new System.ComponentModel.Win32Exception();
  try{var b=new StringBuilder(1024);uint n=GetFinalPathNameByHandleW(h,b,1024,0);if(n==0||n>=1024)throw new System.ComponentModel.Win32Exception();var value=b.ToString();if(!value.StartsWith(@"\\?\")||value.Length<7||value[5]!=':')throw new InvalidOperationException("Canonical local drive required");return value.Substring(4);}
  finally{CloseHandle(h);}
 }
}
'@
 $existing=$target;$suffix=New-Object 'Collections.Generic.List[string]'
 while(-not [IO.Directory]::Exists($existing) -and -not [IO.File]::Exists($existing)){$suffix.Insert(0,[IO.Path]::GetFileName($existing));$existing=[IO.Path]::GetDirectoryName($existing)}
 Check-Entry $existing $false $true
 $target=Check-Path ([SiteStudioLongPath]::Expand($existing))
 Check-Parents $target
 Check-Entry $target $false $true
 foreach($part in $suffix){$target=Join-Path $target $part}
 @{schema='site-studio/windows-custody/1';ok=$true;sid=$sid;path=$target}|ConvertTo-Json -Compress
 exit 0
}
switch($request.operation){
  'directory' {
    if([IO.Directory]::Exists($target)){Check-Entry $target $true $false}
    elseif([IO.File]::Exists($target)){throw 'Directory expected'}
    else {
      $missing=New-Object 'Collections.Generic.List[string]';$current=$target
      while(-not [IO.Directory]::Exists($current)){$missing.Add($current);$current=[IO.Path]::GetDirectoryName($current)}
      for($i=$missing.Count-1;$i -ge 0;$i--){[void][IO.Directory]::CreateDirectory($missing[$i],(New-Security $true));Check-Entry $missing[$i] $true $false}
    }
  }
  'file' {
    if([IO.File]::Exists($target) -or [IO.Directory]::Exists($target)){throw 'File exists'}
    $stream=New-Object IO.FileStream($target,[IO.FileMode]::CreateNew,[Security.AccessControl.FileSystemRights]::Write,[IO.FileShare]::None,4096,[IO.FileOptions]::None,(New-Security $false))
    $stream.Dispose();Check-Entry $target $true $false
  }
  {$_ -in @('inspect','inspect-tree','path','path-tree')} {
    $private=$request.operation.StartsWith('inspect')
    Check-Entry $target $private $false
    if($request.operation.EndsWith('tree')){
      $pending=New-Object 'Collections.Generic.Queue[string]';$pending.Enqueue($target);$count=0
      while($pending.Count){
        foreach($entry in [IO.Directory]::EnumerateFileSystemEntries($pending.Dequeue())){
          $count++;if($count -gt 10000){throw 'Private tree entry limit'}
          Check-Entry $entry $private $false
          if([IO.Directory]::Exists($entry)){$pending.Enqueue($entry)}
        }
      }
    }
  }
  default {throw 'Unknown operation'}
}
@{schema='site-studio/windows-custody/1';ok=$true;sid=$sid}|ConvertTo-Json -Compress
