# Borda aplicada em 23/11/2026

Saidas reais fornecidas pelo usuario no CloudShell. Nao sao resultados de mocks.

## Plano, testes e apply

- Plano salvo borda.tfplan: 20 to add, 0 to change, 0 to destroy.
- terraform test: 3 passed, 0 failed (EC2/encaminhamento privado; HTTPS
  simulado/redirecionamento/MCP; rejeicao de certificado de outra conta).
- Apply complete: 20 added, 0 changed, 0 destroyed, cerca de 2m43s.
- HTTPS NAO habilitado: tls_enabled=false. Dominio e certificado nao confirmados.

## Recursos e endpoints

| Componente | Identificador ou valor |
|---|---|
| EC2 frontend us-east-1a | i-0ad030a1fc6675d94, privado 10.0.0.248 |
| EC2 frontend us-east-1b | i-077658c6a158294e8, privado 10.0.1.240 |
| Origem HTTP temporaria | http://as-docs-public-1122695300.us-east-1.elb.amazonaws.com |
| ALB | arn:aws:elasticloadbalancing:us-east-1:967931808920:loadbalancer/app/as-docs-public/f41191628cceb4ab |
| Hosted zone ID do ALB | Z35SXDOTRQ7X7K |
| BACKEND_URL privado | http://as-docs-internal-7c51427a5e2ed1f2.elb.us-east-1.amazonaws.com:3000 |
| NLB | arn:aws:elasticloadbalancing:us-east-1:967931808920:loadbalancer/net/as-docs-internal/7c51427a5e2ed1f2 |
| Target group frontend | arn:aws:elasticloadbalancing:us-east-1:967931808920:targetgroup/as-docs-frontend/fdb88d05955d24b8 |
| Target group backend | arn:aws:elasticloadbalancing:us-east-1:967931808920:targetgroup/as-docs-backend/4bc5508e424a199c |
| SG NLB | sg-02a6eb6a1f69a0ee7 |
| Ingresso frontend -> NLB | sgr-09bd218bf76263993 |
| Egresso NLB -> nos | sgr-05f9614c204d7f26d |
| Ingresso nos <- NLB | sgr-0abea77e86e8e1577 |
| WAF | arn:aws:wafv2:us-east-1:967931808920:regional/webacl/as-docs-public/67859bec-2864-4906-8a9c-20a58c1f7e33 |
| Log group WAF | aws-waf-logs-as-docs |
| NodePort do backend | 30300 (porta do Service e alvo da aplicacao: 3000) |
| Node group existente | as-docs-private-storage |

Os identificadores nao sao credenciais. Senhas/tokens nao foram incluidos.
State da borda: as-docs/edge.tfstate no bucket de state existente.

## Verificacao real apos o apply

O usuario executou verificar-borda.py e confirmou:

```text
frontend_target_group: unhealthy, unhealthy
backend_target_group: initial, initial, initial
INFRA_VERIFICADA: EC2/SSM, discos, ALB publico, NLB interno, associacao WAF, MCP 404 e regra WAF 403.
Nao valida deploy da aplicacao. Apos publicar os containers e o Service, repetir com --aplicacao.
HTTPS configurado: False
```

O plano seguinte atualizou a leitura dos 20 recursos e retornou:

```text
No changes. Your infrastructure matches the configuration.
```

Isto confirma a convergencia do state edge e as verificacoes descritas no script.
Nao confirma aplicacao pronta. O frontend nao estava publicado (dois targets
unhealthy) e o backend ainda estava em initial nos tres targets. A origem publica
pode retornar 503 ate o deploy real. O teste do NLB ate o backend e dos endpoints
reais ainda depende de Service/containers e de verificar-borda.py --aplicacao.
Domino/certificado, DNS, HTTPS, login e testes funcionais continuam pendentes.
