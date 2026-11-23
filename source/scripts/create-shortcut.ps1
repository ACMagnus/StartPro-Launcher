$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'StartPro Launcher.lnk'
# 每次启动都重新创建，项目移动后快捷方式也能自动指向新路径
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($shortcutPath)
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
if (Test-Path $electron) {
    $lnk.TargetPath = $electron
    $lnk.Arguments = '"' + $root + '"'
} else {
    $lnk.TargetPath = Join-Path $root 'start.bat'
}
$lnk.WorkingDirectory = $root
$lnk.Description = 'StartPro Launcher (SPL) - Minecraft Launcher'
$icon = Join-Path $root 'renderer\assets\icon.ico'
if (Test-Path $icon) { $lnk.IconLocation = "$icon,0" }
$lnk.WindowStyle = 1
$lnk.Save()
Write-Host "[StartPro] Desktop shortcut created: $shortcutPath"
