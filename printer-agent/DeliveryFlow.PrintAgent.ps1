param([int]$Port = 18181)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class DeliveryFlowRawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
    static extern bool OpenPrinter(string printerName, out IntPtr printer, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool ClosePrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
    static extern bool StartDocPrinter(IntPtr printer, int level, [In] DOCINFOA docInfo);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndDocPrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool StartPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool WritePrinter(IntPtr printer, byte[] bytes, int count, out int written);

    public static void Send(string printerName, byte[] bytes, string documentName) {
        IntPtr printer;
        if (!OpenPrinter(printerName, out printer, IntPtr.Zero))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        try {
            var info = new DOCINFOA { pDocName = documentName, pDataType = "RAW" };
            if (!StartDocPrinter(printer, 1, info))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            try {
                if (!StartPagePrinter(printer))
                    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                try {
                    int written;
                    if (!WritePrinter(printer, bytes, bytes.Length, out written) || written != bytes.Length)
                        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                } finally { EndPagePrinter(printer); }
            } finally { EndDocPrinter(printer); }
        } finally { ClosePrinter(printer); }
    }
}
"@
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class DeliveryFlowRaster {
    public static byte[] ToEscPos(Bitmap source) {
        int width = source.Width;
        int height = source.Height;
        int widthBytes = (width + 7) / 8;
        var output = new List<byte>(8 + widthBytes * height);
        output.Add(29); output.Add(118); output.Add(48); output.Add(0);
        output.Add((byte)(widthBytes & 255)); output.Add((byte)((widthBytes >> 8) & 255));
        output.Add((byte)(height & 255)); output.Add((byte)((height >> 8) & 255));

        using (var bitmap = new Bitmap(width, height, PixelFormat.Format24bppRgb)) {
            using (var graphics = Graphics.FromImage(bitmap)) graphics.DrawImageUnscaled(source, 0, 0);
            var rect = new Rectangle(0, 0, width, height);
            var data = bitmap.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
            try {
                int stride = Math.Abs(data.Stride);
                byte[] pixels = new byte[stride * height];
                Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
                for (int y = 0; y < height; y++) {
                    for (int xb = 0; xb < widthBytes; xb++) {
                        byte packed = 0;
                        for (int bit = 0; bit < 8; bit++) {
                            int x = xb * 8 + bit;
                            if (x >= width) continue;
                            int index = y * stride + x * 3;
                            int luminance = (pixels[index] * 11 + pixels[index + 1] * 59 + pixels[index + 2] * 30) / 100;
                            if (luminance < 175) packed |= (byte)(128 >> bit);
                        }
                        output.Add(packed);
                    }
                }
            } finally { bitmap.UnlockBits(data); }
        }
        return output.ToArray();
    }
}
"@ -ReferencedAssemblies System.Drawing

$encoding = [Text.Encoding]::GetEncoding(850)
$esc = [byte]27
$gs = [byte]29

function Add-Bytes([Collections.Generic.List[byte]]$Buffer, [byte[]]$Bytes) {
    $Buffer.AddRange($Bytes)
}

function Add-Text([Collections.Generic.List[byte]]$Buffer, [string]$Text = "") {
    if ($null -eq $Text) { $Text = "" }
    Add-Bytes $Buffer ($encoding.GetBytes($Text + "`n"))
}

function Set-Align([Collections.Generic.List[byte]]$Buffer, [byte]$Mode) {
    Add-Bytes $Buffer ([byte[]]@($esc, 97, $Mode))
}

function Set-Bold([Collections.Generic.List[byte]]$Buffer, [bool]$Enabled) {
    Add-Bytes $Buffer ([byte[]]@($esc, 69, [byte]$(if ($Enabled) { 1 } else { 0 })))
}

function Set-Size([Collections.Generic.List[byte]]$Buffer, [byte]$Size) {
    Add-Bytes $Buffer ([byte[]]@($gs, 33, $Size))
}

function Set-Font([Collections.Generic.List[byte]]$Buffer, [string]$Font) {
    Add-Bytes $Buffer ([byte[]]@($esc, 77, [byte]$(if ($Font -eq "B") { 1 } else { 0 })))
}

function Set-LineSpacing([Collections.Generic.List[byte]]$Buffer, [int]$Spacing) {
    $safeSpacing = [Math]::Max(18, [Math]::Min(60, $Spacing))
    Add-Bytes $Buffer ([byte[]]@($esc, 51, [byte]$safeSpacing))
}

function Set-SectionStyle([Collections.Generic.List[byte]]$Buffer, $Style) {
    $size = [byte]0
    if ($Style.size -eq "large") { $size = 1 }
    if ($Style.size -eq "extra") { $size = 17 }
    Set-Size $Buffer $size
    Set-Bold $Buffer ([bool]$Style.bold)
}

function Fit-Line([string]$Left, [string]$Right, [int]$Width = 48) {
    $leftMax = [Math]::Max(1, $Width - $Right.Length - 1)
    if ($Left.Length -gt $leftMax) { $Left = $Left.Substring(0, $leftMax) }
    return $Left + (" " * [Math]::Max(1, $Width - $Left.Length - $Right.Length)) + $Right
}

function Get-GraphicFont([string]$Family, $Style, [float]$BaseSize) {
    $size = $BaseSize
    if ($Style.size -eq "large") { $size *= 1.28 }
    if ($Style.size -eq "extra") { $size *= 1.62 }
    $fontStyle = if ([bool]$Style.bold) { [Drawing.FontStyle]::Bold } else { [Drawing.FontStyle]::Regular }
    return [Drawing.Font]::new($Family, $size, $fontStyle, [Drawing.GraphicsUnit]::Pixel)
}

function Draw-GraphicText($Graphics, [string]$Text, $Font, [float]$X, [float]$Y, [float]$Width, [string]$Alignment = "left", [float]$Gap = 4) {
    $format = [Drawing.StringFormat]::new()
    $format.Trimming = [Drawing.StringTrimming]::Word
    $format.FormatFlags = [Drawing.StringFormatFlags]::LineLimit
    if ($Alignment -eq "center") { $format.Alignment = [Drawing.StringAlignment]::Center }
    if ($Alignment -eq "right") { $format.Alignment = [Drawing.StringAlignment]::Far }
    $height = [Math]::Ceiling($Graphics.MeasureString($Text, $Font, [int]$Width, $format).Height)
    $Graphics.DrawString($Text, $Font, [Drawing.Brushes]::Black, [Drawing.RectangleF]::new($X, $Y, $Width, $height + 3), $format)
    $format.Dispose()
    return [float]($Y + $height + $Gap)
}

function Build-GraphicTicket($Payload) {
    $style = $Payload.style
    if (-not $style) {
        $style = [pscustomobject]@{
            paper = "80mm"; font = "Arial"; lineSpacing = 30
            sections = [pscustomobject]@{
                header = [pscustomobject]@{ size = "large"; bold = $true }
                items = [pscustomobject]@{ size = "normal"; bold = $true }
                notes = [pscustomobject]@{ size = "large"; bold = $true }
            }
        }
    }
    $width = if ($style.paper -eq "58mm") { 384 } else { 576 }
    $margin = 18
    $contentWidth = $width - ($margin * 2)
    $canvas = [Drawing.Bitmap]::new($width, 3000, [Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [Drawing.Graphics]::FromImage($canvas)
    $graphics.Clear([Drawing.Color]::White)
    $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $family = if ($style.font -eq "Segoe UI" -or $style.font -eq "Consolas") { [string]$style.font } else { "Arial" }
    $spacing = [Math]::Max(0, ([int]$style.lineSpacing - 24) / 2)
    $y = [float]12

    $smallBold = [Drawing.Font]::new($family, 15, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
    $small = [Drawing.Font]::new($family, 14, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
    $footerFont = [Drawing.Font]::new($family, 11, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
    $headerFont = Get-GraphicFont $family $style.sections.header 27
    $storeFont = Get-GraphicFont $family $style.sections.store 16
    $customerFont = Get-GraphicFont $family $style.sections.customer 18
    $itemFont = Get-GraphicFont $family $style.sections.items 21
    $valueFont = Get-GraphicFont $family $style.sections.values 18
    $noteFont = Get-GraphicFont $family $style.sections.notes 20

    $storeLogoDrawn = $false
    if ($Payload.store.printLogoDataUrl -and ([string]$Payload.store.printLogoDataUrl).Contains(",")) {
        try {
            $logoValue = [string]$Payload.store.printLogoDataUrl
            $logoBytes = [Convert]::FromBase64String($logoValue.Substring($logoValue.IndexOf(",") + 1))
            $logoStream = [IO.MemoryStream]::new($logoBytes)
            $logo = [Drawing.Image]::FromStream($logoStream)
            $logoWidth = [Math]::Min(230, $contentWidth)
            $logoHeight = [Math]::Min(115, [Math]::Round($logo.Height * ($logoWidth / $logo.Width)))
            $graphics.DrawImage($logo, [float](($width - $logoWidth) / 2), $y, [float]$logoWidth, [float]$logoHeight)
            $y += $logoHeight + 4
            $logo.Dispose(); $logoStream.Dispose()
            $storeLogoDrawn = $true
        } catch {}
    }
    if (-not $storeLogoDrawn) {
        $storeName = if ($Payload.store.name) { [string]$Payload.store.name } else { "Seu Restaurante" }
        $y = Draw-GraphicText $graphics $storeName $storeFont $margin $y $contentWidth "center" 3
    }
    if ($Payload.sector -eq "caixa") {
        if ($Payload.store.cnpj) { $y = Draw-GraphicText $graphics ("CNPJ: " + $Payload.store.cnpj) $storeFont $margin $y $contentWidth "center" 1 }
        $storeAddress = ((@($Payload.store.street, $Payload.store.number, $Payload.store.neighborhood, $Payload.store.city, $Payload.store.state) | Where-Object { $_ }) -join ", ")
        if ($storeAddress) { $y = Draw-GraphicText $graphics $storeAddress $storeFont $margin $y $contentWidth "center" 1 }
        if ($Payload.store.whatsapp) { $y = Draw-GraphicText $graphics ("WhatsApp: " + $Payload.store.whatsapp) $storeFont $margin $y $contentWidth "center" 3 }
    }

    $isCashReport = $Payload.order.reportType -eq "cash-close"
    $isCancellation = [bool]$Payload.order.isCancellation -or $Payload.order.status -eq "cancelado"
    $kind = if ($isCashReport) { "FECHAMENTO DE CAIXA" } elseif ($isCancellation) { "AVISO PARA A PRODUCAO" } elseif ($Payload.sector -eq "caixa") { "COMPROVANTE DO CAIXA" } else { "COMANDA DE PRODUCAO" }
    $y = Draw-GraphicText $graphics $kind $smallBold $margin $y $contentWidth "center" (5 + $spacing)
    if ($isCancellation) {
        $cancelFont = [Drawing.Font]::new($family, 31, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
        $cancelHeight = 58
        $graphics.FillRectangle([Drawing.Brushes]::Black, $margin, $y, $contentWidth, $cancelHeight)
        $cancelFormat = [Drawing.StringFormat]::new()
        $cancelFormat.Alignment = [Drawing.StringAlignment]::Center
        $cancelFormat.LineAlignment = [Drawing.StringAlignment]::Center
        $graphics.DrawString("PEDIDO CANCELADO", $cancelFont, [Drawing.Brushes]::White, [Drawing.RectangleF]::new($margin, $y, $contentWidth, $cancelHeight), $cancelFormat)
        $cancelFormat.Dispose(); $cancelFont.Dispose()
        $y += $cancelHeight + 8 + $spacing
    }
    if ($Payload.order.isReprint -or [int]$Payload.order.revision -gt 0) {
        $reprintFont = [Drawing.Font]::new($family, 30, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
        $bannerHeight = 52
        $graphics.FillRectangle([Drawing.Brushes]::Black, $margin, $y, $contentWidth, $bannerHeight)
        $bannerFormat = [Drawing.StringFormat]::new()
        $bannerFormat.Alignment = [Drawing.StringAlignment]::Center
        $bannerFormat.LineAlignment = [Drawing.StringAlignment]::Center
        $bannerText = "REIMPRESSAO"
        if ([int]$Payload.order.revision -gt 0) { $bannerText += "  REV. " + $Payload.order.revision }
        $graphics.DrawString($bannerText, $reprintFont, [Drawing.Brushes]::White, [Drawing.RectangleF]::new($margin, $y, $contentWidth, $bannerHeight), $bannerFormat)
        $bannerFormat.Dispose(); $reprintFont.Dispose()
        $y += $bannerHeight + 8 + $spacing
    }
    $graphics.DrawLine([Drawing.Pens]::Black, $margin, $y, $width - $margin, $y); $y += 8 + $spacing
    $documentLabel = if ($isCashReport) { "CAIXA #" + $Payload.order.id } else { "PEDIDO #" + $Payload.order.id }
    $y = Draw-GraphicText $graphics $documentLabel $headerFont $margin $y $contentWidth "center" 1
    $y = Draw-GraphicText $graphics ([string]$Payload.order.reference) $headerFont $margin $y $contentWidth "center" (2 + $spacing)
    $y = Draw-GraphicText $graphics ("Horario: " + $Payload.order.time) $small $margin $y $contentWidth "center" 2
    $promisedTime = $null
    if ($Payload.order.promisedAt) { $promisedTime = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$Payload.order.promisedAt).LocalDateTime.ToString("HH:mm") }

    if ($isCashReport) {
        if ($Payload.order.openedAt) { $y = Draw-GraphicText $graphics ("Aberto: " + [DateTimeOffset]::FromUnixTimeMilliseconds([long]$Payload.order.openedAt).LocalDateTime.ToString("dd/MM/yyyy HH:mm")) $customerFont $margin $y $contentWidth "left" 2 }
        if ($Payload.order.closedAt) { $y = Draw-GraphicText $graphics ("Fechado: " + [DateTimeOffset]::FromUnixTimeMilliseconds([long]$Payload.order.closedAt).LocalDateTime.ToString("dd/MM/yyyy HH:mm")) $customerFont $margin $y $contentWidth "left" 2 }
        if ($Payload.order.openedByName) { $y = Draw-GraphicText $graphics ("Abriu: " + [string]$Payload.order.openedByName) $customerFont $margin $y $contentWidth "left" 2 }
        if ($Payload.order.closedByName) { $y = Draw-GraphicText $graphics ("Fechou: " + [string]$Payload.order.closedByName) $customerFont $margin $y $contentWidth "left" (5 + $spacing) }
    } elseif ($Payload.sector -eq "caixa") {
        $orderDate = if ($Payload.order.orderDate) { [string]$Payload.order.orderDate } else { Get-Date -Format "dd/MM/yyyy" }
        $modeLabel = if ($Payload.order.origin -eq "Delivery") { "Entrega" } elseif ($Payload.order.origin -eq "Retirada") { "Retirada" } else { "Mesa" }
        $y = Draw-GraphicText $graphics ("Data: " + $orderDate + "   Modalidade: " + $modeLabel) $customerFont $margin $y $contentWidth "left" 2
        if ($Payload.order.origin -ne "Mesa") {
            $y = Draw-GraphicText $graphics ("Cliente: " + $Payload.order.customer) $customerFont $margin $y $contentWidth "left" 2
            if ($Payload.order.phone) { $y = Draw-GraphicText $graphics ("Telefone: " + $Payload.order.phone) $customerFont $margin $y $contentWidth "left" 2 }
        }
        if ($promisedTime) { $y = Draw-GraphicText $graphics ("Previsao: " + $Payload.order.estimatedMinutes + " min - ate " + $promisedTime) $customerFont $margin $y $contentWidth "left" 2 }
        if ($Payload.order.origin -eq "Delivery" -and $Payload.order.deliveryAddress) { $y = Draw-GraphicText $graphics ("Endereco: " + $Payload.order.deliveryAddress) $customerFont $margin $y $contentWidth "left" (5 + $spacing) }
    } elseif ($promisedTime) {
        $y = Draw-GraphicText $graphics ("PRONTO ATE " + $promisedTime) $smallBold $margin $y $contentWidth "center" (5 + $spacing)
    }

    $graphics.DrawLine([Drawing.Pens]::Black, $margin, $y, $width - $margin, $y); $y += 8 + $spacing
    foreach ($item in $Payload.order.items) {
        if ($Payload.sector -eq "cozinha") {
            $y = Draw-GraphicText $graphics (([string]$item.quantity) + "x  " + [string]$item.name) $itemFont $margin $y $contentWidth "left" (5 + $spacing)
        } else {
            $value = "R$ " + ([double]$item.price * [int]$item.quantity).ToString("N2", [Globalization.CultureInfo]::GetCultureInfo("pt-BR"))
            $itemTextWidth = [Math]::Max(150, $contentWidth - 115)
            [void](Draw-GraphicText $graphics (([string]$item.quantity) + "x  " + [string]$item.name) $itemFont $margin $y $itemTextWidth "left" 0)
            $nextY = Draw-GraphicText $graphics $value $itemFont ($margin + $itemTextWidth) $y ($contentWidth - $itemTextWidth) "right" 0
            $measured = $graphics.MeasureString((([string]$item.quantity) + "x  " + [string]$item.name), $itemFont, [int]$itemTextWidth)
            $y += [Math]::Max($measured.Height, $nextY - $y) + 5 + $spacing
        }
        if ($item.note) {
            $y = Draw-GraphicText $graphics ("OBS. ITEM: " + [string]$item.note) $noteFont ($margin + 12) $y ($contentWidth - 12) "left" (5 + $spacing)
        }
    }

    if ($isCashReport) {
        $graphics.DrawLine([Drawing.Pens]::Black, $margin, $y, $width - $margin, $y); $y += 7
        $totalFont = Get-GraphicFont $family $style.sections.values 25
        $total = "TOTAL VENDIDO   R$ " + ([double]$Payload.order.total).ToString("N2", [Globalization.CultureInfo]::GetCultureInfo("pt-BR"))
        $y = Draw-GraphicText $graphics $total $totalFont $margin $y $contentWidth "right" (3 + $spacing)
        $totalFont.Dispose()
    } elseif ($Payload.sector -eq "caixa") {
        $graphics.DrawLine([Drawing.Pens]::Black, $margin, $y, $width - $margin, $y); $y += 7
        $subtotal = if ($null -ne $Payload.order.subtotal) { [double]$Payload.order.subtotal } else { [double]$Payload.order.total - [double]$Payload.order.deliveryFee }
        $y = Draw-GraphicText $graphics ("Subtotal: R$ " + $subtotal.ToString("N2", [Globalization.CultureInfo]::GetCultureInfo("pt-BR"))) $valueFont $margin $y $contentWidth "right" 1
        if ([double]$Payload.order.deliveryFee -gt 0) { $y = Draw-GraphicText $graphics ("Taxa de entrega: R$ " + ([double]$Payload.order.deliveryFee).ToString("N2", [Globalization.CultureInfo]::GetCultureInfo("pt-BR"))) $valueFont $margin $y $contentWidth "right" 2 }
        $totalFont = Get-GraphicFont $family $style.sections.values 25
        $total = "TOTAL   R$ " + ([double]$Payload.order.total).ToString("N2", [Globalization.CultureInfo]::GetCultureInfo("pt-BR"))
        $y = Draw-GraphicText $graphics $total $totalFont $margin $y $contentWidth "right" (3 + $spacing)
        $totalFont.Dispose()
        if ($Payload.order.paymentMethod) { $y = Draw-GraphicText $graphics ("Forma: " + $Payload.order.paymentMethod) $small $margin $y $contentWidth "left" 2 }
        if ([double]$Payload.order.change -gt 0) { $y = Draw-GraphicText $graphics ("Troco: R$ " + ([double]$Payload.order.change).ToString("N2", [Globalization.CultureInfo]::GetCultureInfo("pt-BR"))) $smallBold $margin $y $contentWidth "left" (5 + $spacing) }
    }

    if ($Payload.order.note) {
        $y += 3
        $noteTitleY = $y + 8
        $noteText = [string]$Payload.order.note
        $noteHeight = [Math]::Ceiling($graphics.MeasureString($noteText, $noteFont, [int]($contentWidth - 16)).Height)
        $boxHeight = $noteHeight + 38
        $graphics.DrawRectangle([Drawing.Pens]::Black, $margin, $y, $contentWidth, $boxHeight)
        [void](Draw-GraphicText $graphics "OBSERVACAO" $smallBold ($margin + 8) $noteTitleY ($contentWidth - 16) "left" 1)
        [void](Draw-GraphicText $graphics $noteText $noteFont ($margin + 8) ($noteTitleY + 18) ($contentWidth - 16) "left" 0)
        $y += $boxHeight + 7 + $spacing
    }

    $graphics.DrawLine([Drawing.Pens]::Black, $margin, $y, $width - $margin, $y); $y += 7
    $y = Draw-GraphicText $graphics ("Impresso em " + (Get-Date -Format "dd/MM/yyyy HH:mm:ss")) $footerFont $margin $y $contentWidth "center" 10
    $platformLogoPath = Join-Path $PSScriptRoot "..\public\deliveryflow-horizontal.png"
    if (Test-Path -LiteralPath $platformLogoPath) {
        $platformLogo = [Drawing.Image]::FromFile($platformLogoPath)
        $platformWidth = 105
        $platformHeight = [Math]::Round($platformLogo.Height * ($platformWidth / $platformLogo.Width))
        $labelWidth = 92
        [void](Draw-GraphicText $graphics "Desenvolvido por" $footerFont (($width - $labelWidth - $platformWidth) / 2) $y $labelWidth "right" 0)
        $graphics.DrawImage($platformLogo, [float](($width - $labelWidth - $platformWidth) / 2 + $labelWidth + 4), $y, [float]$platformWidth, [float]$platformHeight)
        $platformLogo.Dispose()
        $y += [Math]::Max(18, $platformHeight) + 2
        $y = Draw-GraphicText $graphics "versao 0.1.0" $footerFont $margin $y $contentWidth "center" 7
    }
    $finalHeight = [Math]::Min(2990, [Math]::Ceiling($y))
    $graphics.Dispose()
    $storeFont.Dispose(); $headerFont.Dispose(); $customerFont.Dispose(); $itemFont.Dispose(); $valueFont.Dispose(); $noteFont.Dispose(); $smallBold.Dispose(); $small.Dispose(); $footerFont.Dispose()

    $ticket = $canvas.Clone([Drawing.Rectangle]::new(0, 0, $width, $finalHeight), [Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $canvas.Dispose()
    $previewPath = Join-Path $PSScriptRoot ("last-preview-" + $Payload.sector + ".png")
    $ticket.Save($previewPath, [Drawing.Imaging.ImageFormat]::Png)
    $raster = [DeliveryFlowRaster]::ToEscPos($ticket)
    $ticket.Dispose()
    $buffer = [Collections.Generic.List[byte]]::new()
    Add-Bytes $buffer ([byte[]]@($esc, 64))
    Add-Bytes $buffer $raster
    Add-Bytes $buffer ([byte[]]@(10, 10, 10, $gs, 86, 66, 0))
    return $buffer.ToArray()
}

function Build-Ticket($Payload) {
    return Build-GraphicTicket $Payload
    $buffer = [Collections.Generic.List[byte]]::new()
    Add-Bytes $buffer ([byte[]]@($esc, 64, $esc, 116, 2))
    $style = $Payload.style
    if (-not $style) {
        $style = [pscustomobject]@{
            font = "A"; lineSpacing = 30
            sections = [pscustomobject]@{
                header = [pscustomobject]@{ size = "large"; bold = $true }
                items = [pscustomobject]@{ size = "normal"; bold = $true }
                notes = [pscustomobject]@{ size = "large"; bold = $true }
            }
        }
    }
    Set-Font $buffer ([string]$style.font)
    Set-LineSpacing $buffer ([int]$style.lineSpacing)
    Set-Align $buffer 1
    Set-Bold $buffer $true
    Set-Size $buffer 1
    Add-Text $buffer "DeliveryFlow"
    Set-Size $buffer 0
    Add-Text $buffer $(if ($Payload.sector -eq "caixa") { "COMPROVANTE DO CAIXA" } else { "COMANDA DE PRODUCAO" })
    Set-Bold $buffer $false
    Add-Text $buffer ("-" * 48)
    Set-SectionStyle $buffer $style.sections.header
    Add-Text $buffer ("PEDIDO #" + $Payload.order.id)
    Add-Text $buffer ([string]$Payload.order.reference)
    Set-Size $buffer 0
    Set-Bold $buffer $false
    Add-Text $buffer ("Horario: " + $Payload.order.time)

    if ($Payload.order.origin -eq "Delivery") {
        Set-Align $buffer 0
        Add-Text $buffer ("Cliente: " + $Payload.order.customer)
        if ($Payload.order.phone) { Add-Text $buffer ("Telefone: " + $Payload.order.phone) }
        if ($Payload.order.deliveryAddress) { Add-Text $buffer ("Endereco: " + $Payload.order.deliveryAddress) }
    }

    Add-Text $buffer ("-" * 48)
    Set-Align $buffer 0
    foreach ($item in $Payload.order.items) {
        if ($Payload.sector -eq "cozinha") {
            Set-SectionStyle $buffer $style.sections.items
            Add-Text $buffer (([string]$item.quantity) + "x " + [string]$item.name)
            Set-Size $buffer 0
            Set-Bold $buffer $false
        } else {
            Set-SectionStyle $buffer $style.sections.items
            $value = "R$ " + ([double]$item.price * [int]$item.quantity).ToString("N2", [Globalization.CultureInfo]::GetCultureInfo("pt-BR"))
            Add-Text $buffer (Fit-Line (([string]$item.quantity) + "x " + [string]$item.name) $value)
            Set-Size $buffer 0
            Set-Bold $buffer $false
        }
        if ($item.note) {
            Set-SectionStyle $buffer $style.sections.notes
            Add-Text $buffer ("  OBS. ITEM: " + [string]$item.note)
            Set-Size $buffer 0
            Set-Bold $buffer $false
        }
    }

    if ($Payload.sector -eq "caixa") {
        Add-Text $buffer ("-" * 48)
        Set-Bold $buffer $true
        Set-Size $buffer 1
        $total = "R$ " + ([double]$Payload.order.total).ToString("N2", [Globalization.CultureInfo]::GetCultureInfo("pt-BR"))
        Add-Text $buffer (Fit-Line "TOTAL" $total 24)
        Set-Size $buffer 0
        Set-Bold $buffer $false
        if ($Payload.order.paymentMethod) { Add-Text $buffer ("Forma: " + $Payload.order.paymentMethod) }
        if ([double]$Payload.order.change -gt 0) { Add-Text $buffer ("Troco: R$ " + ([double]$Payload.order.change).ToString("N2", [Globalization.CultureInfo]::GetCultureInfo("pt-BR"))) }
    }

    if ($Payload.order.note) {
        Add-Text $buffer ("-" * 48)
        Set-SectionStyle $buffer $style.sections.notes
        Add-Text $buffer "OBSERVACAO"
        Add-Text $buffer ([string]$Payload.order.note)
        Set-Size $buffer 0
        Set-Bold $buffer $false
    }

    Set-Align $buffer 1
    Add-Text $buffer ("-" * 48)
    Add-Text $buffer ("Impresso em " + (Get-Date -Format "dd/MM/yyyy HH:mm:ss"))
    Add-Text $buffer ""
    Add-Text $buffer ""
    Add-Text $buffer ""
    Add-Bytes $buffer ([byte[]]@($gs, 86, 66, 0))
    return $buffer.ToArray()
}

function Send-Response($Stream, [int]$Status, [string]$Body) {
    $statusText = if ($Status -eq 200) { "OK" } elseif ($Status -eq 204) { "No Content" } else { "Bad Request" }
    $bodyBytes = [Text.Encoding]::UTF8.GetBytes($Body)
    $headers = "HTTP/1.1 $Status $statusText`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($bodyBytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Private-Network: true`r`nConnection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($bodyBytes.Length) { $Stream.Write($bodyBytes, 0, $bodyBytes.Length) }
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "DeliveryFlow Print Agent ativo em http://127.0.0.1:$Port"

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8, $false, 4096, $true)
            $requestLine = $reader.ReadLine()
            if (-not $requestLine) { continue }
            $parts = $requestLine.Split(" ")
            $method = $parts[0]
            $path = $parts[1]
            $contentLength = 0
            while ($true) {
                $line = $reader.ReadLine()
                if ([string]::IsNullOrEmpty($line)) { break }
                if ($line.StartsWith("Content-Length:", [StringComparison]::OrdinalIgnoreCase)) {
                    $contentLength = [int]$line.Substring(15).Trim()
                }
            }

            if ($method -eq "OPTIONS") {
                Send-Response $stream 204 ""
                continue
            }

            if ($method -eq "GET" -and $path -eq "/health") {
                $printerNames = @("TANCA TP-650")
                Send-Response $stream 200 (@{ ok = $true; printers = $printerNames } | ConvertTo-Json -Compress)
                continue
            }

            if ($method -eq "POST" -and ($path -eq "/print" -or $path -eq "/preview")) {
                $chars = New-Object char[] $contentLength
                $read = 0
                while ($read -lt $contentLength) { $read += $reader.Read($chars, $read, $contentLength - $read) }
                $payload = (-join $chars) | ConvertFrom-Json
                if (-not $payload.printerName) { throw "Nome da impressora nao informado." }
                $copies = [Math]::Max(1, [Math]::Min(5, [int]$payload.copies))
                $bytes = Build-Ticket $payload
                if ($path -eq "/preview") {
                    Send-Response $stream 200 (@{ ok = $true; bytes = $bytes.Length; preview = (Join-Path $PSScriptRoot ("last-preview-" + $payload.sector + ".png")) } | ConvertTo-Json -Compress)
                    continue
                }
                for ($copy = 0; $copy -lt $copies; $copy++) {
                    [DeliveryFlowRawPrinter]::Send([string]$payload.printerName, $bytes, "DeliveryFlow - $($payload.sector)")
                }
                Send-Response $stream 200 (@{ ok = $true; bytes = $bytes.Length; copies = $copies } | ConvertTo-Json -Compress)
                continue
            }

            Send-Response $stream 400 '{"ok":false,"error":"Rota invalida"}'
        } catch {
            try { Send-Response $stream 400 (@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress) } catch {}
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
