$enc = [System.Text.Encoding]::GetEncoding(936)
$rep = [string][char]0xFFFD
$files = @('D:\游戏\3\js\ui.js', 'D:\游戏\3\js\save.js')
foreach ($f in $files) {
  $s = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($f))
  $orig = [System.Text.Encoding]::UTF8.GetString($enc.GetBytes($s))
  $n = ([regex]::Matches($orig, $rep)).Count
  Write-Output ('=== ' + $f + '  U+FFFD=' + $n)
  $lines = $orig -split "`n"
  $k = 0
  foreach ($ln in $lines) {
    $k++
    if ($ln.Contains($rep)) { Write-Output ('   L' + $k + ': ' + $ln) }
  }
}
