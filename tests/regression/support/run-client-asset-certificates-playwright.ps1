param(
    [string]$DatabaseName = "",
    [int]$ApiPort = 8082,
    [int]$FrontendPort = 4176,
    [switch]$KeepDatabase
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "../../..")
$frontendDir = Join-Path $repoRoot "ams-frontend-cloudscape"
$serverDir = Join-Path $repoRoot "ams-server"
$serverEnvPath = Join-Path $serverDir ".env"
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$goCacheDir = Join-Path $repoRoot ".gocache-playwright"
$serverOutLog = Join-Path $goCacheDir "client-portal-playwright-api.out.log"
$serverErrLog = Join-Path $goCacheDir "client-portal-playwright-api.err.log"
$frontendOutLog = Join-Path $goCacheDir "client-portal-playwright-frontend.out.log"
$frontendErrLog = Join-Path $goCacheDir "client-portal-playwright-frontend.err.log"

if ([string]::IsNullOrWhiteSpace($DatabaseName)) {
    $DatabaseName = "ams_playwright_client_portal_$timestamp"
}

if ($DatabaseName -notmatch '^ams_playwright_[A-Za-z0-9_]+$') {
    throw "Refusing to create/drop database '$DatabaseName'. Use a name starting with ams_playwright_ for safety."
}

function Get-DotEnvValue {
    param(
        [string]$Path,
        [string]$Key
    )

    $line = Get-Content $Path | Where-Object { $_ -match "^$([Regex]::Escape($Key))=" } | Select-Object -First 1
    if (-not $line) {
        return ""
    }

    $value = ($line -split "=", 2)[1].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
}

function Set-DatabaseInUrl {
    param(
        [string]$DatabaseUrl,
        [string]$Name
    )

    $builder = [System.UriBuilder]::new($DatabaseUrl)
    $builder.Path = "/$Name"
    return $builder.Uri.AbsoluteUri
}

function Get-SafeDatabaseIdentifier {
    param(
        [string]$Name
    )

    return '"' + $Name.Replace('"', '""') + '"'
}

function Invoke-DatabaseSql {
    param(
        [string]$MaintenanceDatabaseUrl,
        [string]$Sql
    )

    $previousPgOptions = $env:PGOPTIONS
    $env:PGOPTIONS = "-c client_min_messages=warning"
    try {
        & psql $MaintenanceDatabaseUrl "-v" "ON_ERROR_STOP=1" "-q" "-c" $Sql | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "psql command failed with exit code $LASTEXITCODE"
        }
    } finally {
        $env:PGOPTIONS = $previousPgOptions
    }
}

function Start-ApiJob {
    param(
        [string]$WorkingDirectory,
        [string]$DatabaseUrl,
        [int]$Port,
        [string]$AllowedOrigin,
        [string]$GoCacheDir,
        [string]$StdoutPath,
        [string]$StderrPath
    )

    return Start-Job -ArgumentList @(
        $WorkingDirectory,
        $DatabaseUrl,
        $Port,
        $AllowedOrigin,
        $GoCacheDir,
        $StdoutPath,
        $StderrPath
    ) -ScriptBlock {
        param(
            [string]$JobWorkingDirectory,
            [string]$JobDatabaseUrl,
            [int]$JobPort,
            [string]$JobAllowedOrigin,
            [string]$JobGoCacheDir,
            [string]$JobStdoutPath,
            [string]$JobStderrPath
        )

        Set-Location $JobWorkingDirectory
        New-Item -ItemType Directory -Force -Path $JobGoCacheDir | Out-Null
        $env:DATABASE_URL = $JobDatabaseUrl
        $env:PORT = "$JobPort"
        $env:APP_ENV = "test"
        $env:ALLOWED_ORIGIN = $JobAllowedOrigin
        $env:GOCACHE = $JobGoCacheDir
        $env:ALERT_RECIPIENT_EMAIL = ""
        $env:CLICKUP_API_TOKEN = ""
        $env:CLICKUP_LIST_ID = ""

        & go run . > $JobStdoutPath 2> $JobStderrPath
    }
}

function Start-FrontendJob {
    param(
        [string]$WorkingDirectory,
        [int]$Port,
        [string]$StdoutPath,
        [string]$StderrPath
    )

    return Start-Job -ArgumentList @(
        $WorkingDirectory,
        $Port,
        $StdoutPath,
        $StderrPath
    ) -ScriptBlock {
        param(
            [string]$JobWorkingDirectory,
            [int]$JobPort,
            [string]$JobStdoutPath,
            [string]$JobStderrPath
        )

        Set-Location $JobWorkingDirectory
        $env:PORT = "$JobPort"
        & node ../tests/regression/support/static-server.cjs > $JobStdoutPath 2> $JobStderrPath
    }
}

function Wait-ForHttp {
    param(
        [string]$Url,
        [object]$Job,
        [string]$Name,
        [string]$ErrorLog
    )

    for ($i = 0; $i -lt 90; $i++) {
        if ($Job.State -in @("Completed", "Failed", "Stopped")) {
            Receive-Job $Job -ErrorAction SilentlyContinue | Out-Null
            throw "$Name exited early with state $($Job.State). See $ErrorLog"
        }

        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    throw "$Name did not become ready at $Url"
}

if (-not (Test-Path $serverEnvPath)) {
    throw "Expected server .env at $serverEnvPath"
}

New-Item -ItemType Directory -Force -Path $goCacheDir | Out-Null

$sourceDatabaseUrl = Get-DotEnvValue -Path $serverEnvPath -Key "DATABASE_URL"
$adminEmail = Get-DotEnvValue -Path $serverEnvPath -Key "SEED_ADMIN_EMAIL"
$adminPassword = Get-DotEnvValue -Path $serverEnvPath -Key "SEED_ADMIN_PASSWORD"

if ([string]::IsNullOrWhiteSpace($sourceDatabaseUrl)) {
    throw "DATABASE_URL is missing from $serverEnvPath"
}
if ([string]::IsNullOrWhiteSpace($adminEmail) -or [string]::IsNullOrWhiteSpace($adminPassword)) {
    throw "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be present in $serverEnvPath"
}

$maintenanceDatabaseUrl = Set-DatabaseInUrl -DatabaseUrl $sourceDatabaseUrl -Name "postgres"
$testDatabaseUrl = Set-DatabaseInUrl -DatabaseUrl $sourceDatabaseUrl -Name $DatabaseName
$quotedDatabaseName = Get-SafeDatabaseIdentifier -Name $DatabaseName
$apiOrigin = "http://127.0.0.1:$ApiPort"
$apiBaseUrl = "$apiOrigin/v1"
$frontendBaseUrl = "http://127.0.0.1:$FrontendPort"
$apiJob = $null
$frontendJob = $null

try {
    Write-Host "Creating isolated PostgreSQL database: $DatabaseName"
    Invoke-DatabaseSql -MaintenanceDatabaseUrl $maintenanceDatabaseUrl -Sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DatabaseName';"
    Invoke-DatabaseSql -MaintenanceDatabaseUrl $maintenanceDatabaseUrl -Sql "DROP DATABASE IF EXISTS $quotedDatabaseName;"
    Invoke-DatabaseSql -MaintenanceDatabaseUrl $maintenanceDatabaseUrl -Sql "CREATE DATABASE $quotedDatabaseName;"

    Write-Host "Applying migrations to $DatabaseName"
    Push-Location $serverDir
    try {
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            & migrate "-path" "db/migrations" "-database" $testDatabaseUrl "up" *> $null
            $migrateExitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        if ($migrateExitCode -ne 0) {
            throw "migrate failed with exit code $migrateExitCode"
        }
    } finally {
        Pop-Location
    }

    Write-Host "Starting isolated API on $apiBaseUrl"
    $apiJob = Start-ApiJob `
        -WorkingDirectory $serverDir `
        -DatabaseUrl $testDatabaseUrl `
        -Port $ApiPort `
        -AllowedOrigin $frontendBaseUrl `
        -GoCacheDir $goCacheDir `
        -StdoutPath $serverOutLog `
        -StderrPath $serverErrLog
    Wait-ForHttp -Url "$apiBaseUrl/health" -Job $apiJob -Name "API" -ErrorLog $serverErrLog

    Write-Host "Building frontend for isolated API"
    Push-Location $frontendDir
    try {
        $previousViteApiBaseUrl = $env:VITE_API_BASE_URL
        $env:VITE_API_BASE_URL = $apiOrigin
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "frontend build failed with exit code $LASTEXITCODE"
        }
    } finally {
        $env:VITE_API_BASE_URL = $previousViteApiBaseUrl
        Pop-Location
    }

    Write-Host "Starting isolated frontend on $frontendBaseUrl"
    $frontendJob = Start-FrontendJob `
        -WorkingDirectory $frontendDir `
        -Port $FrontendPort `
        -StdoutPath $frontendOutLog `
        -StderrPath $frontendErrLog
    Wait-ForHttp -Url $frontendBaseUrl -Job $frontendJob -Name "frontend" -ErrorLog $frontendErrLog

    Write-Host "Running Playwright client asset certificates E2E"
    Push-Location $frontendDir
    try {
        $env:PLAYWRIGHT_BASE_URL = $frontendBaseUrl
        $env:PLAYWRIGHT_API_BASE_URL = $apiBaseUrl
        $env:PLAYWRIGHT_ADMIN_EMAIL = $adminEmail
        $env:PLAYWRIGHT_ADMIN_PASSWORD = $adminPassword
        $env:PLAYWRIGHT_RUN_CLIENT_PORTAL_TRIGGER = "1"

        & npx playwright test ../tests/regression/e2e/client-asset-certificates.spec.ts
        if ($LASTEXITCODE -ne 0) {
            throw "Playwright failed with exit code $LASTEXITCODE"
        }
    } finally {
        Remove-Item Env:\PLAYWRIGHT_BASE_URL -ErrorAction SilentlyContinue
        Remove-Item Env:\PLAYWRIGHT_API_BASE_URL -ErrorAction SilentlyContinue
        Remove-Item Env:\PLAYWRIGHT_ADMIN_EMAIL -ErrorAction SilentlyContinue
        Remove-Item Env:\PLAYWRIGHT_ADMIN_PASSWORD -ErrorAction SilentlyContinue
        Remove-Item Env:\PLAYWRIGHT_RUN_CLIENT_PORTAL_TRIGGER -ErrorAction SilentlyContinue
        Pop-Location
    }

    Write-Host "Playwright client asset certificates E2E passed against isolated DB: $DatabaseName"
} finally {
    if ($frontendJob -and $frontendJob.State -eq "Running") {
        Write-Host "Stopping isolated frontend"
        Stop-Job $frontendJob
    }
    if ($frontendJob) {
        Remove-Job $frontendJob -Force
    }

    if ($apiJob -and $apiJob.State -eq "Running") {
        Write-Host "Stopping isolated API"
        Stop-Job $apiJob
    }
    if ($apiJob) {
        Remove-Job $apiJob -Force
    }

    if ($KeepDatabase) {
        Write-Host "Keeping isolated database for inspection: $DatabaseName"
    } else {
        Write-Host "Dropping isolated database: $DatabaseName"
        Invoke-DatabaseSql -MaintenanceDatabaseUrl $maintenanceDatabaseUrl -Sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DatabaseName';"
        Invoke-DatabaseSql -MaintenanceDatabaseUrl $maintenanceDatabaseUrl -Sql "DROP DATABASE IF EXISTS $quotedDatabaseName;"
    }
}
