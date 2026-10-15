# Native Windows candidate: qualification pending

This branch prepares Site Studio 0.1.11 for native Windows 10/11 x64 with Node 22+ and Windows PowerShell 5.1. It uses no WSL, MSYS or Cygwin. **Native execution is currently unqualified and gated**: the real Windows host went offline during the port. Do not offer this candidate as a supported Windows release. Windows 11, an ordinary Windows token, actual DACL enforcement, hardlink/rename semantics, pane bootstrap and GUI/plugin-host behavior have not been proved.

The Linux baseline is 276 passed. New Windows tests include lexical/argument checks on Linux; native-only cases explicitly skip there. Those skips are not Windows evidence. Main/tag/release/directory submissions stay unchanged.

## Isolated install, after the native test host returns

Use a local fixed NTFS drive, your own account and three separate absolute paths for the program, source and state. Other users must not own or be able to replace any ancestor. Shares, mapped network paths, reparse/junction components, alternate streams, reserved DOS names and ambiguous trailing spaces/dots are refused. Existing state must already have a private current-SID-owned DACL; it is inspected and never repaired. SYSTEM and Administrators remain trusted and privileged. Same-user hostile replacement is outside this boundary.

Download the candidate ZIP and SHA256 sidecar into one folder, and compare hashes before extraction:

```powershell
$zip='.\toolsenabled-site-studio-0.1.11-windows-candidate.zip'
$expected=((Get-Content -LiteralPath ($zip+'.sha256') -Raw).Trim() -split '\s+')[0]
if((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ine $expected){throw 'ZIP checksum mismatch'}
Expand-Archive -LiteralPath $zip -DestinationPath '.\site-studio-source'
Set-Location '.\site-studio-source\site-studio'
.\install.cmd -Site 'C:\Users\you\work\Website' -Prefix 'C:\Users\you\apps\Site Studio 0.1.11' -DataDirectory 'C:\Users\you\data\WebsiteState' -EnableWindowsCandidate
```

The source folder must already exist. Program and state folders must be new. A failed attempt retains new folders for inspection; choose new paths rather than deleting evidence. `install.ps1` is also directly callable from PowerShell with the same parameters. No administrator privilege, policy change, reboot, package install or host-setting edit is intended. The explicit candidate switch is required while qualification is pending. Installer and state operations need the normal current user; an elevated-only pass is insufficient.

The installer verifies every checksum-listed payload member, atomically creates private directories with protected inheritable current-SID/SYSTEM/Administrators DACLs, copies the program and prints an absolute stdio MCP entry. It creates no server, browser or model. The printed entry deliberately omits export, so nothing can export until you add an explicit `--export-dir` whose parent exists. Register only in your test client configuration. For a direct terminal run:

```powershell
$env:SITE_STUDIO_WINDOWS_CANDIDATE='1'
& 'C:\Program Files\nodejs\node.exe' 'C:\Users\you\apps\Site Studio 0.1.11\mcp-web.js' --site 'C:\Users\you\work\Website' --data-dir 'C:\Users\you\data\WebsiteState' --export-dir 'C:\Users\you\work\FinishedWebsite'
```

The default Windows state location, if no explicit data folder is supplied, is the actual account's LocalApplicationData\ToolsEnabled\SiteStudio\<site-key>, obtained from Windows rather than trusting a redirected LOCALAPPDATA. Existing root spellings are canonicalized before the site key, binding and overlap checks. Case aliases and 8.3 spelling are intended to converge on one export lock; this still needs a native receipt. Case-sensitive NTFS directory mode is unsupported. The installer resolves existing ancestor aliases through [GetFinalPathNameByHandleW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew) before overlap checks or writes, and fails closed on expansion failure. New export/staging trees are private; changing their hosting/read permissions remains an explicit human action.

## Native acceptance still required

Set TEMP/TMP to a private test folder and run one job at a time. For maintainer tests, set PYTHON to the actual Python executable (packaging/test dependency only); the product runtime has no Python dependency. Windows has no Unix socket path-length limit: the test runner's Windows branch uses native path validation instead. Start with `node --test --test-concurrency=1 test/windows-native.test.js`, then the stdio lifecycle and security/store/lease/pane tests and full suite with an actual private headless Edge/Chrome path. Record exact counts and skips. Do not change Developer Mode, ACLs outside your created fixtures or machine policy.

Prove: normal-token private creation and broad/null/foreign DACL refusal without repair; unsafe ancestor owner/write rights; NTFS hardlink leases and source hardlink refusal; live writer exclusion, stale same-SID creation-identity recovery and unverifiable legacy SID refusal; case/8.3 aliases; junctions/device/ADS paths; forced rename sharing failures with retained state/original backup; EOF graceful shutdown versus forced process termination; poison NODE_OPTIONS/credential environment refusal before the pane's Node starts; exact-origin dashboard and human-only export. Windows SIGTERM is forced termination: do not count its cleanup as graceful. EOF is the cross-platform graceful path.

The native pane starts PowerShell before Node, clears the child environment to PATH/SystemRoot/TEMP/TMP plus the qualification flag, passes arguments without cmd.exe, bounds time and each stream while reading, and assigns the trusted Node reader to a Job Object immediately after Process.Start. This is not a suspended-before-assignment hostile-child sandbox. Actual deadline/descendant and native launcher behavior remains untested. The reader still writes no state and acquires no lease. Native custody checks inspect paths at operation boundaries rather than pinning ancestor handles for the server lifetime. Concurrent same-user/administrator replacement remains outside this boundary. Native host/plugin GUI support is a separate pending check; the plugin manifest continues to list Linux only.

Windows saves flush a temporary file and rename it, without a directory flush. Export promotion uses multiple directory renames and may need retained-backup recovery after a process/machine crash; no POSIX crash-durability claim is made. File sharing/antivirus can cause visible rename refusal. Keep independent backups for valuable sites.
