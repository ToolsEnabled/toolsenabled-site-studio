param([Parameter(Mandatory=$true)][string]$ProbeDirectory)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -ne 5){throw 'Native Windows PowerShell 5.1 required'}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$trusted=@($sid,'S-1-5-18','S-1-5-32-544')
$trustedOwners=$trusted+@('S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
if(-not [IO.Directory]::Exists($ProbeDirectory)){throw 'Existing owned test directory required'}
# Exercise the actual assessor against in-memory authored raw descriptors. This
# never changes the fixture directory ACL or any ancestor's security descriptor.
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '..\src\windows-private.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Product helper does not parse'}
$functions=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Check-Entry'},$true))
if($functions.Count -ne 1){throw 'Expected the actual product ACL assessor'}
. ([scriptblock]::Create($functions[0].Extent.Text))
function Get-Acl {
 param([string]$LiteralPath)
 if($LiteralPath -cne $ProbeDirectory){throw 'Unexpected ACL fixture path'}
 $value=New-Object PSObject
 $value|Add-Member ScriptMethod GetOwner {param($type) return $script:raw.Owner}
 $value|Add-Member ScriptMethod GetSecurityDescriptorBinaryForm {$bytes=New-Object byte[] $script:raw.BinaryLength;$script:raw.GetBinaryForm($bytes,0);return ,$bytes}
 return $value
}
$prefix='O:'+ $sid +'G:'+ $sid
$private=$prefix+'D:P(A;;FA;;;'+$sid+')(A;;FA;;;SY)(A;;FA;;;BA)'
$outside='S-1-5-32-545'
$cases=@(
 @{name='private exact trusted grants';sddl=$private;private=$true;ancestor=$false;refuse=$false},
 @{name='ancestor ordinary read';sddl=$private+'(A;;0x1200a9;;;'+$outside+')';private=$false;ancestor=$true;refuse=$false},
 @{name='ancestor create-only siblings';sddl=$private+'(A;;0x6;;;'+$outside+')';private=$false;ancestor=$true;refuse=$false},
 @{name='ancestor inherit-only full grant';sddl=$private+'(A;OICIIO;FA;;;'+$outside+')';private=$false;ancestor=$true;refuse=$false},
 @{name='ancestor active write DACL';sddl=$private+'(A;;0x40000;;;'+$outside+')';private=$false;ancestor=$true;refuse=$true},
 @{name='ancestor active delete child';sddl=$private+'(A;;0x40;;;'+$outside+')';private=$false;ancestor=$true;refuse=$true},
 @{name='private outside read';sddl=$private+'(A;;0x1200a9;;;'+$outside+')';private=$true;ancestor=$false;refuse=$true},
 @{name='null DACL';sddl=$prefix;private=$false;ancestor=$true;refuse=$true}
)
$results=@()
foreach($case in $cases){
 $script:raw=New-Object Security.AccessControl.RawSecurityDescriptor($case.sddl)
 $refused=$false;$reason=$null
 try{Check-Entry $ProbeDirectory $case.private $case.ancestor}catch{$refused=$true;$reason=$_.Exception.Message}
 if($refused -ne $case.refuse){throw ('Unexpected ACL outcome: '+$case.name+' '+$reason)}
 if($refused -and $reason -notmatch 'Ancestor replacement rights refused|Private entry grants another principal access|Null DACL refused'){throw ('Unrelated failure cannot qualify refusal: '+$reason)}
 $results+=@{name=$case.name;refused=$refused;reason=$reason}
}
@{schema='site-studio/raw-acl-regression/1';passed=$results.Count;failed=0;powershellMajor=$PSVersionTable.PSVersion.Major;results=$results}|ConvertTo-Json -Depth 6 -Compress
