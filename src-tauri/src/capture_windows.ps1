param($OutputPath)

Add-Type -AssemblyName System.Drawing,System.Windows.Forms

# Torna o processo DPI-aware para que as coordenadas do formulário
# correspondam aos pixels físicos da tela (evita recorte deslocado/errado
# em telas com escala diferente de 100%).
try {
    Add-Type -Name DpiAware -Namespace Native -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool SetProcessDPIAware();
'@
    [void][Native.DpiAware]::SetProcessDPIAware()
} catch { }

[System.Windows.Forms.Application]::EnableVisualStyles()

$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.BackColor = 'Black'
$form.Opacity = 0.25
$form.TopMost = $true
$form.Cursor = 'Cross'
$form.ShowInTaskbar = $false
$form.KeyPreview = $true
$form.WindowState = 'Normal'
$form.StartPosition = 'Manual'
$form.Location = $bounds.Location
$form.Size = $bounds.Size
$form.DoubleBuffered = $true
$form.Add_Shown({
    $form.BringToFront()
    $form.Activate()
    $form.Focus()
})

$script:startX = 0
$script:startY = 0
$script:isDown = $false
$script:captured = $false
$script:rect = New-Object System.Drawing.Rectangle(0,0,0,0)

$form.Add_KeyDown({
    if ($_.KeyCode -eq 'Escape') {
        $script:captured = $false
        $form.Close()
    }
})

$form.Add_MouseDown({
    $script:startX = $_.X
    $script:startY = $_.Y
    $script:isDown = $true
})

$form.Add_MouseMove({
    if ($script:isDown) {
        $x = [Math]::Min($script:startX, $_.X)
        $y = [Math]::Min($script:startY, $_.Y)
        $w = [Math]::Abs($_.X - $script:startX)
        $h = [Math]::Abs($_.Y - $script:startY)
        $script:rect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
        $form.Invalidate()
    }
})

$form.Add_MouseUp({
    $script:isDown = $false
    $script:captured = $true
    $form.Close()
})

$form.Add_Paint({
    if ($script:rect.Width -gt 0 -and $script:rect.Height -gt 0) {
        $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Red, 2)
        $_.Graphics.DrawRectangle($pen, $script:rect)
        $pen.Dispose()
    }
})

[void]$form.ShowDialog()

$rect = $script:rect
if ($script:captured -and $rect.Width -gt 0 -and $rect.Height -gt 0) {
    $screenX = $bounds.X + $rect.X
    $screenY = $bounds.Y + $rect.Y
    $bitmap = New-Object System.Drawing.Bitmap($rect.Width, $rect.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($screenX, $screenY, 0, 0, $rect.Size)
    $graphics.Dispose()
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    Write-Output "OK"
} else {
    Write-Output "CANCEL"
}
