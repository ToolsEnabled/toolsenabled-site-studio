# Native pane bootstrap: no shell, ambient Node loader or inherited credentials.
param([Parameter(Mandatory=$true)][string]$RequestBase64)
$ErrorActionPreference='Stop'
if($env:SITE_STUDIO_WINDOWS_CANDIDATE -ne '1'){throw 'Windows pane remains unqualified; explicit qualification opt in required'}
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$env:PSModulePath="$PSHOME\Modules"
if($RequestBase64.Length -gt 65536){throw 'Pane request too large'}
$request=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($RequestBase64))|ConvertFrom-Json
$root=[IO.Path]::GetFullPath([string]$request.root)
if($root.StartsWith('\\') -or [IO.Path]::GetPathRoot($root).Length -ne 3){throw 'Local plugin root required'}
$reader=Join-Path $root 'tools\site-studio-view.js'
if($request.args.Count -gt 32 -or $request.args[0] -ne '--max-old-space-size=384' -or [IO.Path]::GetFullPath($request.args[1]) -ne $reader){throw 'Unexpected pane program'}
$node=$null
foreach($directory in ([string]$request.env.PATH).Split(';')){
  if(-not $directory -or -not [IO.Path]::IsPathRooted($directory)){continue}
  $candidate=Join-Path $directory 'node.exe'
  if([IO.File]::Exists($candidate)){$node=[IO.Path]::GetFullPath($candidate);break}
}
if(-not $node){throw 'Windows pane needs node.exe on the configured PATH'}
function Quote-Argument([string]$value){
  $out=New-Object Text.StringBuilder;[void]$out.Append('"');$slashes=0
  foreach($character in $value.ToCharArray()){
    if($character -eq '\'){$slashes++;continue}
    if($character -eq '"'){[void]$out.Append(('\'*($slashes*2+1)));[void]$out.Append('"')}
    else{[void]$out.Append(('\'*$slashes));[void]$out.Append($character)}
    $slashes=0
  }
  [void]$out.Append(('\'*($slashes*2)));[void]$out.Append('"');return $out.ToString()
}
# A wrapper killed by the host deadline must close the job handle and reap its
# already assigned reader and descendants. The trusted reader is assigned as
# soon as Process.Start returns; no hostile same-user process isolation claimed.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.IO;
using System.Text;
using System.Threading.Tasks;
public static class SiteStudioPaneJob {
 [StructLayout(LayoutKind.Sequential)] struct BASIC {public long p,j;public uint flags;public UIntPtr a,b;public uint c;public UIntPtr d;public uint e,f;}
 [StructLayout(LayoutKind.Sequential)] struct IO {public ulong a,b,c,d,e,f;}
 [StructLayout(LayoutKind.Sequential)] struct LIMIT {public BASIC basic;public IO io;public UIntPtr a,b,c,d;}
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr a,string b);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr a,int b,ref LIMIT c,int d);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr a,IntPtr b);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr a);
 public static IntPtr Create(){var h=CreateJobObject(IntPtr.Zero,null);if(h==IntPtr.Zero)throw new System.ComponentModel.Win32Exception();var v=new LIMIT();v.basic.flags=0x2000;if(!SetInformationJobObject(h,9,ref v,Marshal.SizeOf(v))){CloseHandle(h);throw new System.ComponentModel.Win32Exception();}return h;}
 public static async Task<string> ReadBounded(TextReader reader){var b=new char[1024];var output=new StringBuilder();int n;while((n=await reader.ReadAsync(b,0,b.Length))>0){if(output.Length+n>32000)throw new InvalidOperationException("Pane output too large");output.Append(b,0,n);}return output.ToString();}
 public static void Assign(IntPtr job,IntPtr process){if(!AssignProcessToJobObject(job,process))throw new System.ComponentModel.Win32Exception();}
}
'@
$job=[SiteStudioPaneJob]::Create();$child=$null
try{
  $start=New-Object Diagnostics.ProcessStartInfo
  $start.FileName=$node;$start.Arguments=(@($request.args|ForEach-Object{Quote-Argument ([string]$_)})-join ' ')
  $start.WorkingDirectory=$root;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $start.StandardOutputEncoding=New-Object Text.UTF8Encoding($false);$start.StandardErrorEncoding=New-Object Text.UTF8Encoding($false)
  $start.EnvironmentVariables.Clear()
  foreach($name in @('PATH','SystemRoot','TEMP','TMP')){if($request.env.$name){$start.EnvironmentVariables[$name]=[string]$request.env.$name}}
  $start.EnvironmentVariables['SITE_STUDIO_WINDOWS_CANDIDATE']='1'
  $child=New-Object Diagnostics.Process;$child.StartInfo=$start
  [void]$child.Start()
  try{[SiteStudioPaneJob]::Assign($job,$child.Handle)}catch{$child.Kill();throw}
  $output=[SiteStudioPaneJob]::ReadBounded($child.StandardOutput);$errors=[SiteStudioPaneJob]::ReadBounded($child.StandardError)
  if(-not $child.WaitForExit(3500)){throw 'Pane reader deadline exceeded'}
  if(-not $output.Wait(200) -or -not $errors.Wait(200)){throw 'Pane pipe deadline exceeded'}
  $text=$output.GetAwaiter().GetResult();$errorText=$errors.GetAwaiter().GetResult()
  if($text.Length -gt 32000 -or $errorText.Length -gt 32000){throw 'Pane output too large'}
  [Console]::Out.Write($text);[Console]::Error.Write($errorText)
  exit $child.ExitCode
}finally{[void][SiteStudioPaneJob]::CloseHandle($job);if($child){$child.Dispose()}}
