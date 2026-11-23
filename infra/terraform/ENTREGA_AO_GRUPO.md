# Entrega da rede ao grupo

## Estado confirmado

Em 22/11/2026, o usuário aplicou o plano no Learner Lab e criou 22 recursos. O
plano seguinte retornou `No changes`. A configuração passou em `validate` e em
3 testes simulados. A implantação final continuará nesta mesma conta AWS.

| Item | Valor |
|---|---|
| Conta | `967931808920` |
| Região | `us-east-1` |
| VPC | `vpc-04354398b0920234a` |
| Sub-rede pública A | `subnet-07934ea197dafcb9b` — `10.0.0.0/24`, `us-east-1a` |
| Sub-rede pública B | `subnet-007a707f3b0232699` — `10.0.1.0/24`, `us-east-1b` |
| Sub-rede privada A | `subnet-02ad1d11473fac085` — `10.0.10.0/24`, `us-east-1a` |
| Sub-rede privada B | `subnet-063bcd96ac81fc44d` — `10.0.11.0/24`, `us-east-1b` |
| SG do futuro ALB | `sg-09949bead0e930a24` |
| SG do futuro frontend | `sg-0a5118ad08038a7e8` |

Os grupos de segurança estão preparados; ALB e EC2 ainda não foram criados.
As sub-redes privadas têm roteamento local. A saída NAT será uma próxima etapa.

## Continuidade

Este ZIP compartilha código e evidências, não o arquivo de state. Para gerenciar
a mesma infraestrutura, os executores precisam usar seu state correspondente e
acesso AWS autorizado à mesma conta. Inicializar um state vazio produzirá um
plano para uma infraestrutura independente.

A etapa 02 prepara o S3 para o state. O bootstrap Terraform iniciou o bucket, mas
uma consulta de Object Lock foi negada pela SCP do Academy. O procedimento atual
confirmou o bucket existente e concluiu bloqueio público, criptografia e
versionamento por operações S3 específicas, sem alterar políticas do laboratório.
A migração foi concluída: backend S3 inicializado, 22 recursos gerenciados no
state e novo plano sem diferenças. O `backend.tf` permite continuar a mesma rede
com acesso AWS autorizado; não execute novamente o helper de migração inicial.

O acesso ao repositório GitHub não concede acesso à conta do Academy nem ao bucket.
O responsável pelo laboratório pode aplicar as alterações revisadas pelo grupo.

## Escopo e próximos componentes

- Aplicação: API NestJS, PostgreSQL 18 e Redis 8.
- IA: API FastAPI e Redis 8 com Vector Sets.
- O Redis dos manifests é compartilhado: DB 1 para aplicação e DB 0 para IA.
- Frontend previsto em duas EC2 públicas, atrás de ALB com WAF.
- Pedro integrará o Keycloak posteriormente; essa integração não bloqueia a base.
- Micdu poderá ajustar a infraestrutura para SonarQube/CI/CD.
- William confirmou três nós privados do EKS. Os serviços serão executados em
  containers nesse cluster; não foi definida dedicação de um nó a cada serviço.

EKS, nós, NAT, banco, ALB, WAF, frontend e deploy da aplicação são etapas seguintes.
Backups e recuperação de dados ainda serão necessários para o requisito de DR.
