param(
    [ValidateSet("All", "AI", "Backend", "Frontend")]
    [string]$Component = "All",

    [ValidateSet("Plan", "Build", "Publish")]
    [string]$Mode = "Plan",

    [string]$ConfirmPublish = "",

    [string]$Profile = "estudante"
)

$ErrorActionPreference = "Stop"

$region = "us-east-1"
$account = "362749056012"
$registry = "$account.dkr.ecr.$region.amazonaws.com"

$app = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$ai = Join-Path (Split-Path $app -Parent) "As-docs-ai"

$componentes = @(
    [PSCustomObject]@{
        Nome = "AI"
        Pasta = $ai
        Dockerfile = "Dockerfile"
        Repositorio = "as-docs-ai"
    },
    [PSCustomObject]@{
        Nome = "Backend"
        Pasta = $app
        Dockerfile = "backend/Dockerfile"
        Repositorio = "as-docs-backend"
    },
    [PSCustomObject]@{
        Nome = "Frontend"
        Pasta = $app
        Dockerfile = "frontend/Dockerfile"
        Repositorio = "as-docs-frontend"
    }
)

if ($Component -ne "All") {
    $componentes = @($componentes | Where-Object Nome -eq $Component)
}

if ($Mode -eq "Publish" -and $ConfirmPublish -cne "PUBLICAR") {
    throw "Publicacao bloqueada. Informe -ConfirmPublish PUBLICAR."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$imagens = @()

foreach ($item in $componentes) {
    if (-not (Test-Path (Join-Path $item.Pasta $item.Dockerfile))) {
        throw "Dockerfile nao encontrado: $($item.Nome)"
    }

    $sha = (& git -C $item.Pasta rev-parse --short=8 HEAD).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao consultar Git: $($item.Nome)"
    }

    $tag = "local-$stamp-$sha"
    $uri = "$registry/$($item.Repositorio):$tag"

    $imagens += [PSCustomObject]@{
        Nome = $item.Nome
        Pasta = $item.Pasta
        Dockerfile = $item.Dockerfile
        Repositorio = $item.Repositorio
        Imagem = $uri
    }
}

Write-Host "`n========== PLANO DE IMAGENS =========="
$imagens | Format-Table Nome, Repositorio, Imagem -AutoSize

if ($Mode -eq "Plan") {
    Write-Host "`nMODO PLAN: nenhum build ou push realizado."
    return
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker nao encontrado."
}

if ($Mode -eq "Publish") {
    if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
        throw "AWS CLI nao encontrada."
    }

    $contaAtual = (& aws sts get-caller-identity `
        --profile $Profile `
        --region $region `
        --query Account `
        --output text).Trim()

    if ($LASTEXITCODE -ne 0 -or $contaAtual -ne $account) {
        throw "Conta AWS incorreta ou sessao expirada."
    }

    foreach ($item in $imagens) {
        & aws ecr describe-repositories `
            --repository-names $item.Repositorio `
            --profile $Profile `
            --region $region `
            --query "repositories[0].repositoryUri" `
            --output text | Out-Null

        if ($LASTEXITCODE -ne 0) {
            throw "Repositorio ECR indisponivel: $($item.Repositorio)"
        }
    }
}

$autenticado = $false

try {
    if ($Mode -eq "Publish") {
        Write-Host "`nAutenticando no ECR..."

        $senha = & aws ecr get-login-password `
            --profile $Profile `
            --region $region

        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($senha)) {
            throw "Falha ao obter autenticacao do ECR."
        }

        $senha | & docker login `
            --username AWS `
            --password-stdin $registry | Out-Null

        if ($LASTEXITCODE -ne 0) {
            throw "Falha no login Docker/ECR."
        }

        $autenticado = $true
        Remove-Variable senha -ErrorAction SilentlyContinue
    }

    foreach ($item in $imagens) {
        Write-Host "`n========== BUILD: $($item.Nome) =========="

        & docker build `
            --platform linux/amd64 `
            --file (Join-Path $item.Pasta $item.Dockerfile) `
            --tag $item.Imagem `
            $item.Pasta

        if ($LASTEXITCODE -ne 0) {
            throw "Falha no build: $($item.Nome)"
        }

        if ($Mode -eq "Publish") {
            Write-Host "`nPUBLICANDO: $($item.Imagem)"
            & docker push $item.Imagem

            if ($LASTEXITCODE -ne 0) {
                throw "Falha na publicacao: $($item.Nome)"
            }
        }
    }

    Write-Host "`n========== CONCLUIDO =========="
    $imagens | Select-Object Nome, Imagem | Format-Table -AutoSize
}
finally {
    Remove-Variable senha -ErrorAction SilentlyContinue

    if ($autenticado) {
        & docker logout $registry | Out-Null
    }
}