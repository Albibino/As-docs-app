# As-docs — retomada do AWS Academy Learner Lab existente

**Revisão:** 24/11/2026 · **Objetivo:** recuperar uma implantação **já provisionada** após `End Lab`, expiração de sessão ou interrupção temporária, **sem recriar VPC/EKS/RDS/ALB e sem executar Terraform automaticamente**.

> **Não confundir:** `Start Lab` reabre a sessão; **`Reset Lab` não é um método de recuperação** e pode destruir o ambiente. Não usar `terraform apply`, `destroy`, `state push`, exclusão de PVC ou recriação de RDS para resolver um serviço temporariamente indisponível. Primeiro identificar a causa.

## A. Quando o laboratório for reaberto

1. Abrir o AWS Academy Learner Lab e clicar em **Start Lab**.
2. Esperar o ambiente indicar acesso disponível. Abrir **AWS Details → AWS CLI → Show**, copiar novamente os três valores temporários para o perfil `[estudante]` em `%USERPROFILE%\.aws\credentials` **sem compartilhá-los**.
3. No PowerShell:

   ```powershell
   Remove-Item Env:AWS_ACCESS_KEY_ID,Env:AWS_SECRET_ACCESS_KEY,Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
   $env:AWS_PROFILE = 'estudante'
   $env:AWS_DEFAULT_REGION = 'us-east-1'
   aws sts get-caller-identity --profile estudante
   ```

4. **Confira o número da conta.** Se for diferente do dono do ambiente existente, **pare**. Não tentar recuperar recursos na conta errada.
5. O ambiente pode exigir alguns minutos para que instâncias, nós EKS e Target Groups sejam recuperados. Confira os estados periodicamente, sem recriar os recursos. Trinta minutos é um **marco prático de triagem**, não uma garantia de disponibilidade.
6. Se o site já responder corretamente e os testes funcionais passarem, **não executar ações adicionais**.

## B. Diagnóstico após a espera, ou quando houver erro específico

```powershell
# Identidade e cluster
aws sts get-caller-identity --profile estudante
aws eks describe-cluster --name as-docs-eks --region us-east-1 --profile estudante --query 'cluster.{Status:status,Endpoint:endpoint}' --output table
aws eks describe-nodegroup --cluster-name as-docs-eks --nodegroup-name as-docs-private-storage --region us-east-1 --profile estudante --query 'nodegroup.{Status:status,Desired:scalingConfig.desiredSize,Issues:health.issues}' --output json

# Instancias: IDENTIFICAR as EC2 frontend pelas tags antes de qualquer acao
aws ec2 describe-instances --region us-east-1 --profile estudante --query 'Reservations[].Instances[].[InstanceId,State.Name,PrivateIpAddress]' --output table

# Banco e balanceadores existentes
aws rds describe-db-instances --region us-east-1 --profile estudante --query 'DBInstances[].[DBInstanceIdentifier,DBInstanceStatus]' --output table
aws elbv2 describe-load-balancers --region us-east-1 --profile estudante --query 'LoadBalancers[].[LoadBalancerName,State.Code,DNSName]' --output table

# Kubernetes, somente se o cluster estiver acessivel
aws eks update-kubeconfig --region us-east-1 --name as-docs-eks --profile estudante
kubectl get nodes -L topology.kubernetes.io/zone
kubectl -n as-docs get deployments,pods,pvc,svc
kubectl -n as-docs-identity get deployments,pods,svc
```

**Se o comando `kubectl` não conectar:** antes de alterar infra, verificar credenciais expiradas, contexto/configuração do cluster, estado do EKS e **o IP público atual** permitido na API EKS. O `/32` do arquivo local `infra/terraform/eks-acesso.auto.tfvars` pode estar obsoleto após mudar de rede. Qualquer correção via Terraform exige `plan` cuidadoso e confirmação de que só altera o acesso pretendido.

## C. Interpretar os sintomas

| Sintoma | Onde verificar | Próximo passo seguro |
|---|---|---|
| `ExpiredToken`, `InvalidClientTokenId` | AWS Details → AWS CLI → Show; `aws sts get-caller-identity` | Atualizar `aws_access_key_id`, `aws_secret_access_key` e `aws_session_token` locais; limpar variáveis de ambiente antigas. |
| Console AWS funciona, mas `kubectl` não conecta | `aws eks describe-cluster`, `kubectl config current-context`, IP `/32` da API | Atualizar kubeconfig e conferir controle de acesso. Não recriar EKS. |
| Nenhum nó `Ready` | `aws eks describe-nodegroup`, ASG, `kubectl get nodes` | Esperar recuperação; investigar erros da capacidade EC2, IAM e rede antes de escalar. |
| Redis `Pending` ou PVC aguardando volume | `kubectl describe pod -n as-docs <POD>`; `kubectl -n as-docs get pvc`; zona dos nós | Aguardar nó na mesma AZ do EBS e examinar eventos; **não excluir PVC** nem recriar volume. |
| EC2 frontend `stopped` | EC2 Console ou `describe-instances`, tags do projeto | Iniciar **somente as duas instâncias frontend identificadas**, se a sessão permitir, e conferir `instance-status`. |
| ALB ativo, site retorna 502/503 | Target Groups e `describe-target-health` no Console/CLI | Verificar saúde das EC2 e do backend, NLB interno e rede. Não alterar DNS antes de entender os targets. |
| Backend/IA com pod não saudável | `kubectl describe pod`; `kubectl logs ... --tail=100` | Conferir ConfigMaps/Secrets/rede e readiness. Evitar reinícios contínuos sem causa. |
| Keycloak ou OAuth2 falhando | Pods em `as-docs-identity`; issuer `/id/realms/as-docs`; JWKS; logs backend/IA | Confirmar Keycloak saudável e token/issuer/audience/scopes/segredos da **mesma conta**. Não expor tokens. |
| IA apresenta erro de certificado | `as-docs-ai-tls`, `as-docs-internal-ca`, CA montada no backend | Confirmar SAN, datas, CA correspondente e reinícios após atualização; não desativar validação TLS. |
| Site responde, chat não | Backend→IA HTTPS 8443, Keycloak, Redis, logs AI | Diferenciar indexação, falta de documento, autorização e timeout; testar `/health/ready` interno. |

## D. Ações específicas, somente se o diagnóstico exigir

**EC2 frontend paradas:** identificar os IDs no Console EC2/Tags ou na saída da CLI. Executar `aws ec2 start-instances --instance-ids <ID_FRONTEND_1> <ID_FRONTEND_2> --region us-east-1 --profile estudante` **substituindo placeholders pelos IDs corretos da própria conta**. Depois conferir status checks `ok` e o Target Group do ALB. Não iniciar instâncias indiscriminadamente, sobretudo nodes EKS gerenciados pelo ASG.

**Pods com erro:**

```powershell
kubectl -n as-docs get pods -o wide
kubectl -n as-docs describe pod <POD_COM_PROBLEMA>
kubectl -n as-docs logs deployment/as-docs-backend --tail=100
kubectl -n as-docs logs -l app=as-docs-ai -c ai --tail=100 --max-log-requests=2
kubectl -n as-docs-identity get pods
```

**Serviços críticos:** confirmar Redis, PVC, EKS e RDS antes de reiniciar workloads. Se houver alterações reais de ConfigMap/Secret, um `rollout restart` controlado poderá ser necessário, mas não corrige ausência de nó nem credencial AWS expirada.

**HTTPS externo:** verificar DNS para ALB correto, certificado ACM `ISSUED`, listener 443 e targets. Não usar `curl -k` como evidência de TLS correto.

**HTTPS interno:** o Service `as-docs-ai` deve fornecer `8443/TCP`. O Caddy sidecar entrega TLS ao backend com CA interna; a IA usa OAuth2. Se o certificado de 90 dias expirou, usar o guia [README-OAUTH-TLS.md](../deploy/k8s/README-OAUTH-TLS.md) e regenerar o **certificado do servidor** com a CA privada preservada, ou renovar a cadeia e ConfigMaps/Secrets de modo coordenado.

## E. Critério de recuperação

```powershell
kubectl -n as-docs get deployments
kubectl -n as-docs get pods,pvc,svc
curl.exe -sS -o NUL -w 'HTTPS: HTTP %{http_code}\n' https://SEU_HOSTNAME/
curl.exe -sS -o NUL -w 'API: HTTP %{http_code}\n' https://SEU_HOSTNAME/api/health/live
```

Use **o hostname da própria conta**, não o endereço da principal se estiver recuperando outra instalação. O aceite requer HTTPS público sem ignorar certificados, API saudável, login/abertura da aplicação, edição e persistência após F5, colaboração em tempo real, indexação e chat com fonte. O E2E automatizado pode criar/editar páginas demonstrativas reais; usar em ambiente apropriado.

## F. Quando considerar Terraform novamente?

**Somente** se os diagnósticos demonstrarem que um recurso foi de fato excluído ou que uma alteração declarativa de infraestrutura é necessária. Primeiro:

1. Confirmar identidade AWS, região, bucket de state e state real de cada módulo.
2. Conferir se o recurso não está apenas `stopped`, `pending` ou em recuperação.
3. Rodar `terraform plan` no **módulo específico**, sem aplicar, e inspecionar todas as alterações, incluindo `-/+` e `destroy`.
4. Prosseguir com mudança somente após confirmar que ela não substitui volumes/dados ou componentes que deveriam ser preservados.

Não usar `Reset Lab` para tentar consertar o ambiente e não executar `terraform destroy` como recuperação.
