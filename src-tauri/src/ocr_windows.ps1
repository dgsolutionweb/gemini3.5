param($ImagePath)

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

# PowerShell nao resolve metodos de extensao (GetAwaiter) em IAsyncOperation.
# Helper converte o IAsyncOperation/IAsyncAction da WinRT em Task .NET via reflexao
# e aguarda o resultado de forma sincrona.
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($op, $resultType) {
    $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
    $task.Wait(-1) | Out-Null
    $task.Result
}

try {
    $resolved = (Resolve-Path $ImagePath).Path

    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($resolved)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

    $ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if ($null -eq $ocrEngine) {
        # Fallback: tenta primeiro idioma de OCR disponivel no sistema.
        $available = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages
        if ($available -and $available.Count -gt 0) {
            $ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($available[0])
        }
    }
    if ($null -eq $ocrEngine) {
        Write-Output "ERROR:OCR_NOT_AVAILABLE"
        exit 1
    }

    $result = Await ($ocrEngine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

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
