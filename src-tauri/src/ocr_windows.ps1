param($ImagePath)

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]

try {
    $file = [Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $ImagePath)).GetAwaiter().GetResult()
    $stream = $file.OpenReadAsync().GetAwaiter().GetResult()
    $decoder = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream).GetAwaiter().GetResult()
    $bitmap = $decoder.GetSoftwareBitmapAsync().GetAwaiter().GetResult()

    $ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if ($ocrEngine -eq $null) {
        Write-Output "ERROR:OCR_NOT_AVAILABLE"
        exit 1
    }

    $result = $ocrEngine.RecognizeAsync($bitmap).GetAwaiter().GetResult()
    $lines = @()
    foreach ($line in $result.Lines) {
        $lines += $line.Text
    }
    Write-Output ($lines -join "`n")
}
catch {
    Write-Output "ERROR:$($_.Exception.Message)"
    exit 1
}
