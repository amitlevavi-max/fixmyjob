# Checks that the benchmark tables are filled and current.
# Run from the shvoong folder:
#   powershell -ExecutionPolicy Bypass -File supabase\check_benchmarks.ps1
# Read-only: uses the app's public key, changes nothing.

$base = 'https://nebgfohbxsdcthvrlipm.supabase.co/rest/v1'
$headers = @{ apikey = 'sb_publishable_W5uhS6oxIAv4z_fXt485-g_Qd7Vhp26' }

function Show($ok, $text) {
  if ($ok) { Write-Host "  [OK]   $text" -ForegroundColor Green }
  else     { Write-Host "  [TODO] $text" -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "UNION PAY FIGURES" -ForegroundColor Cyan
try {
  $u = Invoke-RestMethod "$base/latest_union_premiums?select=occupation_group,premium_pct,period" -Headers $headers
  $groups = @($u | Where-Object { $_.occupation_group -ne 'total' }).Count
  $period = ($u | Measure-Object -Property period -Maximum).Maximum
  Show ($groups -ge 12) "$groups of 12 occupation groups loaded (data year $period)"
  $u | Sort-Object premium_pct -Descending | ForEach-Object {
    Write-Host ("         {0,-20} union members earn {1,6}%  vs non-union" -f $_.occupation_group, $_.premium_pct)
  }
} catch {
  Show $false "Could not read union table: $($_.Exception.Message)  -> run: npx supabase db push"
}

Write-Host ""
Write-Host "LOCAL WAGES (BLS OEWS)" -ForegroundColor Cyan
try {
  $w = Invoke-RestMethod "$base/latest_wage_benchmarks?select=area_type,area_code,area_label,p50,period&soc=eq.00-0000" -Headers $headers
  $filled = @($w | Where-Object { $_.p50 -ne $null })
  $n = $filled.Count
  $period = ($filled | Measure-Object -Property period -Maximum).Maximum
  if ($n -eq 0) {
    Show $false "No wage data yet - the app is using its built-in 2023 numbers (works fine meanwhile)."
    Write-Host '         Next: run the wage refresh (job "oews") and send Claude the output.'
  } else {
    Show ($n -ge 52) "$n of 52 areas loaded (US + 50 states + DC), wage year $period"
    $us = $filled | Where-Object { $_.area_type -eq 'national' }
    if ($us) { Write-Host ("         US median wage, all jobs: `${0:N0}/yr" -f [double]$us.p50) }
    if ($n -lt 52) { Write-Host "         Still filling - each refresh run adds more; the daily schedule will finish it." }
  }
} catch {
  Show $false "Could not read wage table: $($_.Exception.Message)  -> run: npx supabase db push"
}
Write-Host ""
