param(
    [ValidateSet("All", "Backend", "AI")]
    [string]$Component = "All",

    [ValidateSet("Plan", "Deploy")]
    [string]$Mode = "Plan",

    [string]$ImageTag = "",
    [string]$ConfirmDeploy = "",

    [string]$Profile = "estudante"
)

$ErrorActionPreference = "Stop"

$region = "us-east-1"
$account = "362749056012"
$namespace = "as-docs"
$registry = "$account.dkr.ecr.$region.amazonaws.com"

$targets = @(
    [PSCustomObject]@{
        Name = "Backend"
        Deployment = "as-docs-backend"
        Container = "backend"
        Repository = "as-docs-backend"
    },
    [PSCustomObject]@{
        Name = "AI"
        Deployment = "as-docs-ai"
        Container = "ai"
        Repository = "as-docs-ai"
    }
)

if ($Component -ne "All") {
    $targets = @($targets | Where-Object Name -eq $Component)
}

if ($Mode -eq "Deploy") {
    if ($Component -eq "All") {
        throw "Atualize um componente por vez."
    }

    if ($ConfirmDeploy -cne "DEPLOYAR") {
        throw "Deploy bloqueado. Confirmacao necessaria."
    }

    if ($ImageTag -notmatch '^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$') {
        throw "Informe uma tag de imagem valida."
    }
}

$cfg = Join-Path $env:TEMP (
    "asdocs-eks-{0}.yaml" -f [guid]::NewGuid().ToString("N")
)

$perfilAnterior = $env:AWS_PROFILE

try {
    $env:AWS_PROFILE = $Profile

    $identidade = & aws sts get-caller-identity `
        --profile $Profile `
        --region $region `
        --query Account `
        --output text

    if ($LASTEXITCODE -ne 0 -or "$identidade".Trim() -ne $account) {
        throw "Conta AWS incorreta ou credenciais expiradas."
    }

    & aws eks update-kubeconfig `
        --name as-docs-eks `
        --region $region `
        --profile $Profile `
        --kubeconfig $cfg | Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao configurar acesso ao EKS."
    }

    foreach ($item in $targets) {
        Write-Host "`n========== $($item.Name) =========="

        $resposta = & kubectl --kubeconfig $cfg `
            -n $namespace `
            get deployment $item.Deployment -o json

        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao consultar $($item.Deployment)."
        }

        $deployment = ($resposta -join "`n") | ConvertFrom-Json

        $container = @(
            $deployment.spec.template.spec.containers |
                Where-Object { $_.name -eq $item.Container }
        )

        if ($container.Count -ne 1) {
            throw "Container esperado nao encontrado."
        }

        $oldImage = $container[0].image

        $permissao = & kubectl --kubeconfig $cfg `
            -n $namespace `
            auth can-i patch "deployment/$($item.Deployment)"

        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao verificar permissao."
        }

        Write-Host "Deployment: $($item.Deployment)"
        Write-Host "Container:  $($item.Container)"
        Write-Host "Imagem:     $oldImage"
        Write-Host "Disponivel: $($deployment.status.readyReplicas)/$($deployment.spec.replicas)"
        Write-Host "Patch:      $permissao"

        if ($Mode -eq "Plan") {
            continue
        }

        if ("$permissao".Trim() -ne "yes") {
            throw "Sem permissao para atualizar o deployment."
        }

        $newImage = "$registry/$($item.Repository):$ImageTag"

        Write-Host "`nVerificando imagem no ECR..."

        $digest = & aws ecr describe-images `
            --repository-name $item.Repository `
            --image-ids "imageTag=$ImageTag" `
            --profile $Profile `
            --region $region `
            --query "imageDetails[0].imageDigest" `
            --output text

        if ($LASTEXITCODE -ne 0 -or
            [string]::IsNullOrWhiteSpace("$digest") -or
            "$digest".Trim() -eq "None") {
            throw "Imagem nao encontrada no ECR."
        }

        if ($oldImage -eq $newImage) {
            Write-Host "A imagem ja esta implantada."
            continue
        }

        Write-Host "`nImagem nova: $newImage"

        $alterou = $false

        try {
            & kubectl --kubeconfig $cfg `
                -n $namespace `
                set image "deployment/$($item.Deployment)" `
                "$($item.Container)=$newImage"

            if ($LASTEXITCODE -ne 0) {
                throw "Falha ao atualizar a imagem."
            }

            $alterou = $true

            & kubectl --kubeconfig $cfg `
                -n $namespace `
                rollout status "deployment/$($item.Deployment)" `
                --timeout=600s

            if ($LASTEXITCODE -ne 0) {
                throw "O rollout nao foi concluido."
            }

            Write-Host "`nDEPLOY CONCLUIDO: $($item.Name)"
        }
        catch {
            Write-Warning "Falha durante o deploy: $_"

            if ($alterou) {
                Write-Warning "Tentando restaurar a imagem anterior..."

                & kubectl --kubeconfig $cfg `
                    -n $namespace `
                    set image "deployment/$($item.Deployment)" `
                    "$($item.Container)=$oldImage"

                if ($LASTEXITCODE -eq 0) {
                    & kubectl --kubeconfig $cfg `
                        -n $namespace `
                        rollout status "deployment/$($item.Deployment)" `
                        --timeout=600s

                    if ($LASTEXITCODE -ne 0) {
                        Write-Warning "Rollback nao confirmado."
                    }
                }
                else {
                    Write-Warning "Falha ao iniciar rollback."
                }
            }

            throw "Deploy falhou. Verifique o deployment."
        }
    }

    if ($Mode -eq "Plan") {
        Write-Host "`nMODO PLAN: nenhuma alteracao realizada."
    }
}
finally {
    Remove-Item $cfg -ErrorAction SilentlyContinue

    if ($null -eq $perfilAnterior) {
        Remove-Item Env:\AWS_PROFILE -ErrorAction SilentlyContinue
    }
    else {
        $env:AWS_PROFILE = $perfilAnterior
    }
}