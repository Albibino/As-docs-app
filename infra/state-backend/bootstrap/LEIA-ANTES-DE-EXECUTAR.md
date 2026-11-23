# Bootstrap Terraform interrompido no Academy

Em 22/11/2026, `terraform validate` passou, o teste simulado passou e o plano
mostrou 4 adições. O `apply` iniciou a criação do bucket, mas a leitura seguinte
falhou: `s3:GetBucketObjectLockConfiguration` foi explicitamente negada por uma
Service Control Policy do laboratório.

A criação do bucket pode ter ocorrido antes dessa leitura. Não reaplique o plano
salvo e não exclua o bucket ou os arquivos de state para tentar novamente.

Os arquivos Terraform desta pasta ficam como registro da tentativa. Sua execução
fica suspensa nesta conta. O helper `recuperar-configuracao-s3.sh` verifica se o
bucket já existe e pertence à conta esperada, preserva os arquivos locais
existentes e configura somente bloqueio público, criptografia e versionamento
pelas APIs S3 correspondentes. Ele não faz a consulta Object Lock bloqueada e
não altera IAM/SCP. Qualquer outra negativa de acesso interrompe a execução.

Se o `head-bucket` inicial falhar, pare e confira o resultado: o helper não cria
outro bucket e não trata um erro 403 como se o bucket estivesse ausente.

O state parcial do bootstrap continua preservado para rastreabilidade. Ele não
é o state da rede. O bucket de apoio passa a ter suas configurações mantidas por
este helper; não há exclusão remota nem remoção de registros do state pelo script.

Consulte o README da etapa 02 para executar a recuperação e depois migrar o
state da rede. Object Lock do S3 (retenção) e `use_lockfile` do backend Terraform
(exclusão mútua entre execuções) são mecanismos diferentes.
