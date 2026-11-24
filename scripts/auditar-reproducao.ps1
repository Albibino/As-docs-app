
<#
.SYNOPSIS
  Auditoria somente leitura de referencias especificas de conta, VPC e deploy.
.DESCRIPTION
  Execute a partir da raiz local de As-docs-app; nao depende de letra P:/C:/D:.
  Nao altera arquivos, AWS, Terraform, Git ou Kubernetes.
  Mostra localizacao e tipo de referencia, sem imprimir linhas inteiras com possiveis segredos.
  Nao substitui revisao manual dos dois repositorios e do terraform plan.
.EXAMPLE
  .\scripts\auditar-reproducao.ps1 -RepoApp (Get-Location).Path -RepoAI 'CAMINHO_LOCAL_DO_AS_DOCS_AI' -Profile estudante
#>
param(
    [string]$RepoApp = (Get-Location).Path,
    [string]$RepoAI = '',
    [string]$Profile = 'estudante'
)
$ErrorActionPreference = 'Stop'
$RepoApp = (Resolve-Path -LiteralPath $RepoApp).Path
if (-not (Test-Path -LiteralPath (Join-Path $RepoApp 'infra\edge\frontend.tf'))) {
    throw 'RepoApp precisa apontar para a raiz local de As-docs-app.'
}

$principalAccount = '362749056012'
$originalAccount = '967931808920'
$principalVpc = 'vpc-0a79932ef5165619e'
$originalVpc = 'vpc-04354398b0920234a'

Write-Host '=== Identidade da conta AWS em uso ==='
$currentAccount = (aws sts get-caller-identity --profile $Profile --query Account --output text)
if ($LASTEXITCODE -ne 0 -or ($currentAccount -notmatch '^\d{12}$')) {
    throw 'Nao foi possivel verificar a identidade AWS. Renove as credenciais.'
}
$currentAccount = $currentAccount.Trim()
Write-Host "Conta atual: $currentAccount"
if ($currentAccount -eq $principalAccount) {
    Write-Warning 'Voce esta usando a conta principal. Nao altere hardcodes da infraestrutura valida sem um plano revisado.'
}

$files = @(
  'infra\terraform\backend.tf', 'infra\terraform\providers.tf', 'infra\terraform\terraform.tfvars',
  'infra\terraform\preparar-eks.sh', 'infra\terraform\preparar-volumes.py', 'infra\terraform\verificar-volumes.py',
  'infra\database\versions.tf', 'infra\database\providers.tf', 'infra\database\main.tf', 'infra\database\preparar-banco.py',
  'infra\edge\versions.tf', 'infra\edge\providers.tf', 'infra\edge\frontend.tf', 'infra\edge\variables.tf',
  'infra\edge\preparar-borda.py', 'infra\edge\verificar-borda.py', 'infra\edge\tests\edge.tftest.hcl',
  'deploy\k8s\20-backend-config.yaml', 'deploy\k8s\22-backend.yaml',
  'frontend\nginx\default.conf.template'
)

$patterns = @(
  @{ Tag = 'Conta principal'; Value = [regex]::Escape($principalAccount) },
  @{ Tag = 'Conta antiga'; Value = [regex]::Escape($originalAccount) },
  @{ Tag = 'VPC principal'; Value = [regex]::Escape($principalVpc) },
  @{ Tag = 'VPC antiga'; Value = [regex]::Escape($originalVpc) },
  @{ Tag = 'Hostname publico principal'; Value = 'www\.asdocs\.abrdns\.com' },
  @{ Tag = 'Dominio de exemplo'; Value = 'docs\.exemplo\.com' },
  @{ Tag = 'GHCR antigo'; Value = 'ghcr\.io/albibino' },
  @{ Tag = 'Nginx possivelmente antigo'; Value = 'default\s+\$fwd_proto;' }
)

Write-Host "`n=== Arquivos ativos a adaptar (apenas localizacao; nao substitui) ==="
foreach ($rel in $files) {
    $full = Join-Path $RepoApp $rel
    if (-not (Test-Path -LiteralPath $full)) {
        Write-Warning "Arquivo nao encontrado: $rel"
        continue
    }
    $lineNo = 0
    foreach ($line in [System.IO.File]::ReadLines($full)) {
        $lineNo++
        foreach ($pattern in $patterns) {
            if ($line -match $pattern.Value) {
                Write-Host "${rel}:${lineNo} [$($pattern.Tag)]"
            }
        }
    }
}

Write-Host "`n=== Conferencias basicas da aplicacao ==="
$backendPath = Join-Path $RepoApp 'deploy\k8s\22-backend.yaml'
$backend = [System.IO.File]::ReadAllText($backendPath)
Write-Host ('Backend NodePort 30300: ' + ($backend -match 'nodePort:\s*30300'))
Write-Host ('Backend usa ECR: ' + ($backend -match '\.dkr\.ecr\.[^.]+\.amazonaws\.com/as-docs-backend'))
$nginx = [System.IO.File]::ReadAllText((Join-Path $RepoApp 'frontend\nginx\default.conf.template'))
Write-Host ('X-Forwarded-Proto correto: ' + ($nginx -match 'default\s+\$http_x_forwarded_proto;'))

if ($RepoAI) {
    $RepoAI = (Resolve-Path -LiteralPath $RepoAI).Path
    $aiManifest = Join-Path $RepoAI 'deploy\k8s\20-ai.yaml'
    $aiConfig = Join-Path $RepoAI 'deploy\k8s\10-ai-config.yaml'
    if (Test-Path -LiteralPath $aiManifest) {
        $ai = [System.IO.File]::ReadAllText($aiManifest)
        Write-Host ('IA usa ECR: ' + ($ai -match '\.dkr\.ecr\.[^.]+\.amazonaws\.com/as-docs-ai'))
        if ($ai -match $principalAccount -and $currentAccount -ne $principalAccount) {
            Write-Warning 'O manifesto IA ainda aponta para a conta principal.'
        }
    } else { Write-Warning 'Nao encontrado: deploy/k8s/20-ai.yaml' }
    if (Test-Path -LiteralPath $aiConfig) {
        $cfg = [System.IO.File]::ReadAllText($aiConfig)
        Write-Host ('IA modo hashing: ' + ($cfg -match 'AI_EMBEDDING_PROVIDER:\s*["'']hashing'))
        Write-Host ('IA modo extractive: ' + ($cfg -match 'AI_CHAT_PROVIDER:\s*["'']extractive'))
    } else { Write-Warning 'Nao encontrado: deploy/k8s/10-ai-config.yaml' }
}

Write-Host "`n=== Estado Git (somente nomes de arquivos) ==="
if (Test-Path -LiteralPath (Join-Path $RepoApp '.git')) {
    git -C $RepoApp status --short
}
if ($RepoAI -and (Test-Path -LiteralPath (Join-Path $RepoAI '.git'))) {
    git -C $RepoAI status --short
}
Write-Host "`nAuditoria somente leitura concluida. Revisar referencias e executar terraform plan ANTES do apply."
