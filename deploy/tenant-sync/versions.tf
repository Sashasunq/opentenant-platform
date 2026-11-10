terraform {
  required_version = ">= 1.5"

  required_providers {
    vault = {
      source  = "hashicorp/vault"
      version = "~> 5.13"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3.5"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.3"
    }
  }

  # State lives in a Secret next to the CronJob; pods are ephemeral.
  backend "kubernetes" {
    secret_suffix     = "tenant-sync"
    namespace         = "platform-system"
    in_cluster_config = true
  }
}
