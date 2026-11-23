variable "eks_version" {
  description = "Versão confirmada pelo describe-cluster-versions do Academy."
  type        = string
  default     = "1.37"
}

variable "eks_node_instance_type" {
  description = "Instância x86_64 permitida nesta entrega; três nós On-Demand."
  type        = string
  default     = "t3.medium"

  validation {
    condition     = contains(["t3.medium", "t3.large"], var.eks_node_instance_type)
    error_message = "Use t3.medium ou t3.large, respeitando os limites do Learner Lab."
  }
}

variable "eks_api_access_cidrs" {
  description = "IPv4 /32 dos operadores. preparar-eks.sh registra o IP atual do CloudShell em arquivo local ignorado pelo Git."
  type        = set(string)

  validation {
    condition = length(var.eks_api_access_cidrs) > 0 && alltrue([
      for cidr in var.eks_api_access_cidrs : can(cidrnetmask(cidr)) && can(regex("/32$", cidr))
    ])
    error_message = "Informe pelo menos um IPv4 /32 para a API; a entrega não permite CIDRs públicos amplos. Execute preparar-eks.sh."
  }
}
