# Sets the addons.mozilla.org signing credentials for this PowerShell session
# only. Dot-source it so the variables stay set:   . .\scripts\set-amo-keys.ps1
# The secret is read masked, so it never appears on screen or in the
# PowerShell history file. Works in Windows PowerShell 5.1 and PowerShell 7.

$env:WEB_EXT_API_KEY = Read-Host 'JWT issuer / JWT-Aussteller (user:...)'
$secure = Read-Host 'JWT secret / JWT-Schluessel' -AsSecureString
$env:WEB_EXT_API_SECRET = [System.Net.NetworkCredential]::new('', $secure).Password
Remove-Variable secure

if (-not $env:WEB_EXT_API_KEY -or -not $env:WEB_EXT_API_SECRET) {
    Write-Warning 'One of the values is empty; signing will fail.'
} else {
    Write-Host 'AMO credentials set for this window. Close it (or run Remove-Item Env:WEB_EXT_API_*) when done.'
}
