variable "vault_address" {
  description = "Vault the tenant records live in, e.g. https://vault.example.com."
  type        = string
}

variable "vault_auth_mount" {
  description = "Mount of the Vault Kubernetes auth method the sync logs in through."
  type        = string
  default     = "kubernetes"
}

variable "vault_role" {
  description = "Vault role bound to the tenant-sync ServiceAccount, with list on the tenant metadata."
  type        = string
  default     = "tenant-sync"
}

variable "vault_jwt_path" {
  description = "ServiceAccount token presented to Vault; the kubelet-projected one rotates on its own."
  type        = string
  default     = "/var/run/secrets/kubernetes.io/serviceaccount/token"
}

variable "kube_config_path" {
  description = "Kubeconfig for running outside the cluster; null uses the in-cluster ServiceAccount."
  type        = string
  default     = null
}

variable "tenant_mount" {
  description = "KV v2 mount holding the tenant registry."
  type        = string
  default     = "secret"
}

variable "tenant_prefix" {
  description = "Registry path under the mount; records sit at <prefix>/<userId>/<projectId>."
  type        = string
  default     = "tenants"
}

variable "namespace_prefix" {
  description = "Prepended to the project id to name each tenant's namespace."
  type        = string
  default     = "ffmpeglab-"
}

variable "secret_refresh_interval" {
  description = "How often ESO re-reads the tenant record from Vault."
  type        = string
  default     = "5m"
}

variable "cluster_secret_store_name" {
  description = "ClusterSecretStore with Vault credentials, installed once per cluster."
  type        = string
  default     = "vault-backend"
}

variable "chart_repository" {
  description = "Where the FFmpegLab chart is published, e.g. oci://registry.example.com/charts."
  type        = string

  validation {
    condition     = length(trimspace(var.chart_repository)) > 0
    error_message = "chart_repository is required: the chart is not vendored into this repository."
  }
}

variable "chart_name" {
  description = "Chart name within chart_repository."
  type        = string
  default     = "ffmpeglab"
}

variable "chart_version" {
  description = "Exact chart version, 0.8.0 or later."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+\\.[0-9]+\\.[0-9]+", var.chart_version))
    error_message = "chart_version must be an exact version such as 0.8.0, not a range."
  }
}

variable "chart_values" {
  description = "Extra chart values applied to every tenant release, on top of the defaults."
  type        = any
  default     = {}
}

variable "image_tag" {
  description = "Server image tag for every tenant; empty keeps the chart's appVersion."
  type        = string
  default     = ""
}
