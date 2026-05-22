param($OutputPath)

Add-Type -AssemblyName System.Drawing,System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()

$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen

$form = New-Object System.Windows.Forms.Form
$form.Bounds = $bounds
$form.FormBorderStyle = 'None'
$form.BackColor = 'Black'
$form.Opacity = 0.05
$form.TopMost = $true
$form.Cursor = 'Cross'
$form.ShowInTaskbar = $false
$form.WindowState = 'Normal'
$form.StartPosition = 'Manual'
$form.Location = $bounds.Location
$form.Size = $bounds.Size
$form.BringToFront()

$startX = 0; $startY = 0; $isDown = $false
$rect = New-Object System.Drawing.Rectangle(0,0,0,0)
$captured = $false

$form.Add_KeyDown({
    if ($_.KeyCode -eq 'Escape') {
        $captured = $false
        $form.Close()
    }
})

$form.Add_MouseDown({
    $startX = $_.X; $startY = $_.Y
    $isDown = $true
})

$form.Add_MouseMove({
    if ($isDown) {
        $rect.X = [Math]::Min($startX, $_.X)
        $rect.Y = [Math]::Min($startY, $_.Y)
        $rect.Width = [Math]::Abs($_.X - $startX)
        $rect.Height = [Math]::Abs($_.Y - $startY)
        $form.Invalidate()
    }
})

$form.Add_MouseUp({
    $isDown = $false
    $captured = $true
    $form.Close()
})

$form.Add_Paint({
    if ($rect.Width -gt 0 -and $rect.Height -gt 0) {
        $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Red, 2)
        $_.Graphics.DrawRectangle($pen, $rect)
    }
})

[void]$form.ShowDialog()

if ($captured -and $rect.Width -gt 0 -and $rect.Height -gt 0) {
    $bitmap = New-Object System.Drawing.Bitmap($rect.Width, $rect.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($rect.X, $rect.Y, 0, 0, $rect.Size)
    $graphics.Dispose()
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    Write-Output "OK"
} else {
    Write-Output "CANCEL"
}
