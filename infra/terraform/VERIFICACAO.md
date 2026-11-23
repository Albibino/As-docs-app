# Verificação desta entrega

## Resultado real no CloudShell — 22/11/2026

Evidências fornecidas pelo usuário em
`evidencias/2026-11-22-validacao-e-plano.txt` e
`evidencias/2026-11-22-aplicacao-e-convergencia.txt`:

| Verificação | Resultado no laboratório |
|---|---|
| `TMPDIR=/var/tmp terraform init` com `TF_DATA_DIR` configurado | Concluído, provider AWS 6.73.0 instalado. |
| `terraform validate` | Configuração válida. |
| `terraform test` | 3 aprovados, 0 falhas; provider simulado. |
| `terraform plan -out=rede.tfplan` | 22 adições, 0 alterações, 0 exclusões. |
| Região e zonas do plano | `us-east-1`, zonas `us-east-1a` e `us-east-1b`. |
| `terraform apply rede.tfplan` | Concluído: 22 adições, 0 alterações, 0 exclusões. |
| `terraform plan` após aplicar | `No changes`: infraestrutura corresponde à configuração. |

O plano contém 1 VPC, 1 Internet Gateway, 4 sub-redes, 3 tabelas de rotas,
1 rota pública, 4 associações de tabelas de rotas, 2 Security Groups e 6 regras
de Security Groups. Não há EC2, EKS, RDS, NAT, ALB ou WAF para criar nesta etapa.

Esse resultado comprova validação, criação e correspondência da configuração de
rede gerenciada pelo Terraform. Não substitui testes de tráfego ou de aplicação.
Funcionamento da aplicação e DR pertencem às próximas etapas.

## Aplicação da rede — 22/11/2026

A evidência `evidencias/2026-11-22-aplicacao-e-convergencia.txt` registra a criação
dos 22 recursos e o plano subsequente sem diferenças. A VPC criada é
`vpc-04354398b0920234a`, na conta `967931808920`, região `us-east-1`. Os IDs e
orientações para continuidade estão em `ENTREGA_AO_GRUPO.md`.

O usuário confirmou que a implantação final continuará nesta mesma conta. O state
atualmente é local no CloudShell do usuário; a migração para S3 é a próxima etapa.

## Retomada após reinício do CloudShell — 22/11/2026

A evidência `evidencias/2026-11-22-retomada-e-plano.txt` registra a recuperação da
sessão. Código e plano permaneceram no diretório pessoal. O usuário reinstalou
Terraform 1.17.2, copiou o executável para `$HOME/.local/bin` e configurou `PATH`.

O provider 6.73.0 foi reinstalado com `TF_DATA_DIR` e `TMPDIR` em `/var/tmp`. O novo
plano teve as mesmas ações do plano anteriormente revisado: 22 adições, nenhuma
alteração e nenhuma exclusão. A evidência não contém execução de `terraform apply`.

## Preparação local anterior

Ferramentas utilizadas na preparação:

- Terraform 1.17.2, obtido do canal oficial com SHA-256 conferido.
- Provider AWS 6.73.0, instalado pelo Terraform com assinatura HashiCorp.

### Resultados na preparação local

| Verificação | Resultado |
|---|---|
| `terraform init -backend=false` | Concluído; lock file incluído. |
| `terraform fmt -check -recursive` | Concluído sem alterações pendentes. |
| `terraform validate` | Bloqueado pela restrição de sockets Unix do ambiente de preparação. |
| `terraform test` | Não executado nessa preparação: dependia da mesma comunicação local com o provider. |
| Plano e aplicação na conta do laboratório | Não executados durante a preparação local. |

O erro observado na inicialização do provider foi `socket: operation not
permitted`. Essas restrições impediram a validação e os testes naquela preparação
local. Posteriormente, o usuário concluiu essas verificações e o plano real no
CloudShell, conforme registrado no início deste documento. A restrição local não
era uma falha de permissão da conta AWS do usuário.

Nenhum recurso AWS foi criado na preparação deste pacote.

## Ajuste para espaço no CloudShell

O primeiro `init` real enviado pelo usuário falhou com `no space left on device`
ao extrair o provider. O diagnóstico `df -h` mostrou 145 MB livres no diretório
pessoal e 9,2 GB no filesystem que contém `/tmp` e `/var/tmp`.

O README passou a usar `TF_DATA_DIR` em `/var/tmp` e `TMPDIR=/var/tmp` no `init`,
sem alterar a localização do código ou do state local. O arquivo
`cloudshell-env.sh` prepara essa variável a cada sessão. O usuário executou a
mesma configuração manualmente no CloudShell e confirmou a inicialização,
validação, testes e geração do plano, conforme a evidência acima.
