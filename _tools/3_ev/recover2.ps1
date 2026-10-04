$ErrorActionPreference = 'Stop'
$enc = [System.Text.Encoding]::GetEncoding(936)
$rep = [string][char]65533
$report = New-Object System.Collections.ArrayList
$pairs = @(
  @('D:\游戏\3\js\ui.js', 'D:\游戏\3\js\ui.recovered.js'),
  @('D:\游戏\3\js\save.js', 'D:\游戏\3\js\save.recovered.js')
)
foreach ($p in $pairs) {
  $f = $p[0]
  $outp = $p[1]
  $bytes = [System.IO.File]::ReadAllBytes($f)
  $s = [System.Text.Encoding]::UTF8.GetString($bytes)
  $orig = [System.Text.Encoding]::UTF8.GetString($enc.GetBytes($s))
  $n = ([regex]::Matches($orig, $rep)).Count
  [void]$report.Add('=== ' + $f + '  bytes=' + $bytes.Length + '  U+FFFD=' + $n)
  $lines = $orig.Split([char]10)
  for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i].Contains($rep)) { [void]$report.Add('  L' + ($i + 1) + ': ' + $lines[$i]) }
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($outp, $orig, $utf8NoBom)
}
[System.IO.File]::WriteAllLines('D:\游戏\_tools\3_ev\damage.txt', $report.ToArray(), (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'done'
