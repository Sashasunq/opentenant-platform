# Vault registry in, running tenants out. See README.md, "Tenant sync".

data "vault_kv_secrets_list_v2" "users" {
  mount = var.tenant_mount
  name  = local.prefix
}

data "vault_kv_secrets_list_v2" "projects" {
  for_each = toset(local.user_ids)

  mount = var.tenant_mount
  name  = "${local.prefix}/${each.value}"
}

locals {
  prefix = trim(var.tenant_prefix, "/")

  # The provider marks names sensitive; they are paths, and for_each needs them plain.
  user_names    = nonsensitive(data.vault_kv_secrets_list_v2.users.names)
  project_names = { for user, list in data.vault_kv_secrets_list_v2.projects : user => nonsensitive(list.names) }

  # Directories only: the registry marker is a leaf and keeps the listing from ever being empty.
  user_ids = [for k in local.user_names : trimsuffix(k, "/") if endswith(k, "/")]

  # Keyed by "<userId>/<projectId>", the path the platform writes.
  tenants = merge([
    for user, names in local.project_names : {
      for project in names : "${user}/${project}" => {
        slug      = lower(project)
        namespace = "${var.namespace_prefix}${lower(project)}"
      }
      if !endswith(project, "/")
    }
  ]...)
}

resource "kubernetes_namespace_v1" "tenant" {
  for_each = local.tenants

  metadata {
    name = each.value.namespace
    labels = {
      "app.kubernetes.io/part-of" = "ffmpeglab"
      "ffmpeglab.com/tenant"      = each.value.slug
    }
  }
}

resource "kubernetes_manifest" "tenant_external_secret" {
  for_each = local.tenants

  manifest = {
    apiVersion = "external-secrets.io/v1"
    kind       = "ExternalSecret"

    metadata = {
      name      = "${each.value.slug}-supabase"
      namespace = kubernetes_namespace_v1.tenant[each.key].metadata[0].name
      labels = {
        "app.kubernetes.io/part-of" = "ffmpeglab"
        "ffmpeglab.com/tenant"      = each.value.slug
      }
    }

    spec = {
      refreshInterval = var.secret_refresh_interval

      secretStoreRef = {
        kind = "ClusterSecretStore"
        name = var.cluster_secret_store_name
      }

      target = {
        name           = "${each.value.slug}-supabase"
        creationPolicy = "Owner"
      }

      dataFrom = [
        { extract = { key = "${local.prefix}/${each.key}" } }
      ]
    }
  }

  # Helm installs atomically; without the Secret the pods never start and the release rolls back.
  wait {
    condition {
      type   = "Ready"
      status = "True"
    }
  }

  timeouts {
    create = "3m"
    update = "3m"
  }
}

resource "helm_release" "tenant" {
  for_each = local.tenants

  name       = each.value.slug
  namespace  = kubernetes_namespace_v1.tenant[each.key].metadata[0].name
  repository = var.chart_repository
  chart      = var.chart_name
  version    = var.chart_version

  atomic          = true
  cleanup_on_fail = true
  timeout         = 300

  # Later documents win, so chart_values can override either default.
  values = [
    yamlencode({
      existingSecret = kubernetes_manifest.tenant_external_secret[each.key].manifest.spec.target.name
      deploymentAnnotations = {
        "reloader.stakater.com/auto" = "true"
      }
    }),
    yamlencode(var.image_tag != "" ? { image = { tag = var.image_tag } } : {}),
    yamlencode(var.chart_values),
  ]
}
