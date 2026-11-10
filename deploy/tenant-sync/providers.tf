provider "vault" {
  address          = var.vault_address
  skip_child_token = true

  # Read on every run, so the kubelet-rotated token is always current; no copy is kept.
  auth_login {
    path = "auth/${var.vault_auth_mount}/login"
    parameters = {
      role = var.vault_role
      jwt  = trimspace(file(var.vault_jwt_path))
    }
  }
}

provider "kubernetes" {
  config_path = var.kube_config_path
}

provider "helm" {
  kubernetes = {
    config_path = var.kube_config_path
  }
}
