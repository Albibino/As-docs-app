# Conta confirmada pelo usuário via STS. ARNs são identificadores, não credenciais.
expected_account_id = "362749056012"

# Padrão inicial permitido pelo laboratório. Confirme a região da entrega com o grupo.
aws_region   = "us-east-1"
project_name = "as-docs"
vpc_cidr     = "10.0.0.0/16"

# Funções disponibilizadas pelo Academy. O código não cria funções IAM.
eks_cluster_role_arn = "arn:aws:iam::362749056012:role/c224838a5679056l16527373t1w362749-LabEksClusterRole-5oFMQZ4JdGTe"
eks_node_role_arn    = "arn:aws:iam::362749056012:role/c224838a5679056l16527373t1w362749056-LabEksNodeRole-tdY5AdgRbC4S"

# Etapa 05: estado pretendido compartilhado; a LabRole existente fornece EBS.
# Requer revisar o plano de substituicao do grupo e aplicar storage-gp3.yaml.
eks_storage_enabled = true
