param(
  [string]$BackendUrl = "https://lush-laundry-backend.onrender.com",
  [string]$FrontendUrl = "https://your-frontend.vercel.app"
)

Write-Host "Read-only URL alignment check" -ForegroundColor Cyan

try {
  $root = Invoke-WebRequest -UseBasicParsing -Uri "$BackendUrl/" -Method Get -TimeoutSec 20
  Write-Host "Backend root reachable: $($root.StatusCode)" -ForegroundColor Green
} catch {
  Write-Host "Backend root check failed: $($_.Exception.Message)" -ForegroundColor Red
}

try {
  $health = Invoke-WebRequest -UseBasicParsing -Uri "$BackendUrl/api/health" -Method Get -TimeoutSec 20
  Write-Host "Backend health reachable: $($health.StatusCode)" -ForegroundColor Green
  Write-Host $health.Content
} catch {
  Write-Host "Backend health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "\nExpected config summary:" -ForegroundColor Yellow
Write-Host "Render FRONTEND_URL = $FrontendUrl"
Write-Host "Vercel VITE_API_URL = $BackendUrl"
Write-Host "Render SYSTEM_ADMIN_EMAILS = comma-separated systems admin emails"

Write-Host "\nNo data was modified by this script." -ForegroundColor Cyan
