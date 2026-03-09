# ============================================================
# Nokto EHF - Generering av secrets
# ============================================================
# Kjør i PowerShell fra prosjektmappen
# ============================================================

Write-Host "=== Nokto EHF Secret Generator ===" -ForegroundColor Cyan
Write-Host ""

# 1. Generer ENCRYPTION_KEY (32 bytes base64)
Write-Host "1. ENCRYPTION_KEY (32 bytes base64):" -ForegroundColor Yellow
$encryptionKey = node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
Write-Host "   $encryptionKey" -ForegroundColor Green
Write-Host ""

# 2. Generer DATABASE_URL passord
Write-Host "2. Database passord (32 tegn):" -ForegroundColor Yellow
$dbPassword = node -e "console.log(require('crypto').randomBytes(24).toString('base64').replace(/[+\/=]/g, 'x'))"
Write-Host "   $dbPassword" -ForegroundColor Green
Write-Host ""

# 3. Generer Redis passord
Write-Host "3. Redis passord (24 tegn):" -ForegroundColor Yellow
$redisPassword = node -e "console.log(require('crypto').randomBytes(18).toString('base64').replace(/[+\/=]/g, 'x'))"
Write-Host "   $redisPassword" -ForegroundColor Green
Write-Host ""

# 4. Vis eksempel .env-linjer
Write-Host "=== Kopier disse til .env ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "ENCRYPTION_KEY=$encryptionKey"
Write-Host "DATABASE_URL=postgresql://nokto_user:$($dbPassword)@db.nokto.no:5432/nokto_ehf?sslmode=require"
Write-Host "REDIS_URL=redis://:$($redisPassword)@redis.nokto.no:6379"
Write-Host ""

# 5. Sjekk at Node.js er installert
Write-Host "=== Systemsjekk ===" -ForegroundColor Cyan
$nodeVersion = node --version 2>$null
if ($nodeVersion) {
    Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "Node.js: IKKE INSTALLERT" -ForegroundColor Red
}

$pnpmVersion = pnpm --version 2>$null
if ($pnpmVersion) {
    Write-Host "pnpm: $pnpmVersion" -ForegroundColor Green
} else {
    Write-Host "pnpm: IKKE INSTALLERT - kjør: npm install -g pnpm" -ForegroundColor Red
}

Write-Host ""
Write-Host "Ferdig!" -ForegroundColor Cyan
