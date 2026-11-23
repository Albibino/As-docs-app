# Conta confirmada pelo usuário via STS. ARNs são identificadores, não credenciais.
expected_account_id = "967931808920"

# Padrão inicial permitido pelo laboratório. Confirme a região da entrega com o grupo.
aws_region   = "us-east-1"
project_name = "as-docs"
vpc_cidr     = "10.0.0.0/16"

# Funções disponibilizadas pelo Academy. O código não cria funções IAM.
eks_cluster_role_arn = "arn:aws:iam::967931808920:role/c224838a5679056l18095764t1w967931-LabEksClusterRole-QxlrzRzS2pNv"
eks_node_role_arn    = "arn:aws:iam::967931808920:role/c224838a5679056l18095764t1w967931808-LabEksNodeRole-YrMVa34iJda6"

# Etapa 05: estado pretendido compartilhado; a LabRole existente fornece EBS.
# Requer revisar o plano de substituicao do grupo e aplicar storage-gp3.yaml.
eks_storage_enabled = true
