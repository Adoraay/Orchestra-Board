# Crée un raccourci "Agent Board" sur le Bureau qui lance launcher\AgentBoard.vbs.
# Usage : clic droit > Exécuter avec PowerShell, ou `powershell -ExecutionPolicy Bypass -File launcher\creer-raccourci.ps1`
$launcher = Join-Path $PSScriptRoot 'AgentBoard.vbs'
$root = Split-Path $PSScriptRoot -Parent
$icon = Join-Path $root 'node_modules\electron\dist\electron.exe'
$desktop = [Environment]::GetFolderPath('Desktop')

$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'Agent Board.lnk'))
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = "`"$launcher`""
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$icon,0"
$shortcut.Description = 'Agent Board'
$shortcut.Save()

Write-Host "Raccourci cree : $(Join-Path $desktop 'Agent Board.lnk')"
