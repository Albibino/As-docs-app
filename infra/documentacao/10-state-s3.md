# Continuidade da infraestrutura e state S3

A implantação final continuará na conta `967931808920`, `us-east-1`. A rede tem
22 recursos criados e um plano posterior sem diferenças. O state foi migrado para
S3 após confirmação de cópia pelo usuário. Um novo `init`, a lista dos 22 recursos
gerenciados e o plano `No changes` confirmaram a continuidade da mesma rede.

O bootstrap Terraform do bucket passou em validação, em 1 teste simulado e no
plano de 4 adições. O apply foi interrompido na leitura
`s3:GetBucketObjectLockConfiguration`, explicitamente negada por uma SCP do
Academy. O helper executado posteriormente confirmou o bucket existente na conta
esperada e concluiu sua configuração.

O helper `infra/state-backend/bootstrap/recuperar-configuracao-s3.sh` verifica a
conta e um bucket já existente, preserva os arquivos locais do bootstrap e
configura bloqueio público, criptografia e versionamento pelas APIs S3 específicas.
Não consulta Object Lock, não altera IAM/SCP e interrompe em novas negativas de
acesso. O bootstrap Terraform anterior não deve ser reaplicado nesta conta.
Os registros locais da tentativa são preservados para rastreabilidade.

O usuário executou a versão avulsa desse helper e confirmou os quatro bloqueios
públicos `true`, criptografia `AES256` e versionamento `Enabled`. O helper
preservou os arquivos locais antes da configuração. Evidência em
`infra/state-backend/evidencias/2026-11-22-configuracao-s3.md`.

O bloqueio de state do backend (`use_lockfile`) é separado de Object Lock. O
Terraform confirmou o backend S3; os 22 recursos continuaram no state e o novo
plano não indicou alterações. Evidência em
`infra/terraform/evidencias/2026-11-22-migracao-state-s3.md`. Ao
habilitar versionamento pela primeira vez, observar o intervalo de 15 minutos
recomendado pela AWS antes das gravações.

William pediu incluir o Terraform no repositório da aplicação, em `infra/terraform`.
O apoio ao state fica em `infra/state-backend`. Não incluir states, planos,
providers ou credenciais no Git. O backend ativo está incluído em
`infra/terraform/backend.tf`, após a migração confirmada. O acesso ao repositório
não concede acesso à conta AWS.

William confirmou três nós privados do EKS. Os containers serão executados nesse
cluster; não foi definida dedicação de um nó a cada serviço. Pedro integrará o
Keycloak e Micdu poderá ajustar CI/CD/SonarQube. A aplicação e a recuperação dos
dados ainda têm etapas de implantação pendentes.
