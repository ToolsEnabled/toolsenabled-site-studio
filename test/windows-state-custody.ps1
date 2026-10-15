param([Parameter(Mandatory=$true)][string]$DataDirectory)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$trusted=@($sid,'S-1-5-18','S-1-5-32-544')
$queue=New-Object 'Collections.Generic.Queue[string]';$queue.Enqueue($DataDirectory)
$records=@()
while($queue.Count){
 $path=$queue.Dequeue()
 if($records.Count -ge 1000){throw 'Fixture tree limit'}
 if(([int][IO.File]::GetAttributes($path) -band [int][IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Fixture reparse point'}
 $acl=Get-Acl -LiteralPath $path
 $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
 if($owner -cne $sid){throw 'Actual private fixture owner differs from current SID'}
 $raw=New-Object Security.AccessControl.RawSecurityDescriptor($acl.GetSecurityDescriptorBinaryForm(),0)
 if($null -eq $raw.DiscretionaryAcl){throw 'Null fixture DACL'}
 foreach($ace in $raw.DiscretionaryAcl){
  if($ace.AceType -ne [Security.AccessControl.AceType]::AccessAllowed -or $trusted -notcontains $ace.SecurityIdentifier.Value){throw 'Unexpected fixture ACE'}
 }
 $records+=@{relativePath=[string]$path.Substring($DataDirectory.Length);ownerSid=[string]$owner;sddl=[string]$acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]'Owner,Group,Access')}
 if([IO.Directory]::Exists($path)){foreach($entry in [IO.Directory]::EnumerateFileSystemEntries($path)){$queue.Enqueue($entry)}}
}
@{currentSid=$sid;records=$records;count=$records.Count}|ConvertTo-Json -Depth 5 -Compress
