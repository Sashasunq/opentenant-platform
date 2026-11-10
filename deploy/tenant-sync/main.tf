# Flat tenant registry via the Vault provider: every key under
# secret/metadata/tenants/ is one tenant. An entry becomes a namespace, an
# ExternalSecret and a Helm release; removing the entry tears all three down.
# Secret values are fetched by External Secrets Operator inside the cluster -
# nothing sensitive reaches this module.

# vault_kv_secrets_list_v2 errors when the path does not exist yet, which is
# exactly the "no tenants at all" case - swallow that into an empty list.

locals {
  tenant_slugs = [
    for k in try(data.vault_kv_secrets_list_v2.tenants.names, []) :
    trimsuffix(k, "/")
  ]
}

data "vault_kv_secrets_list_v2" "tenants" {
  mount = var.tenant_mount
  name  = trim(var.tenant_prefix, "/")
}

resource "kubernetes_namespace" "tenant" {
  for_each = toset(local.tenant_slugs)

  metadata {
    name = "${var.namespace_prefix}${each.value}"
    labels = {
      "app.kubernetes.io/part-of" = "ffmpeglab"
      "ffmpeglab.com/tenant"      = each.value
    }
  }
}

resource "kubernetes_manifest" "tenant_external_secret" {
  for_each = toset(local.tenant_slugs)

  manifest = {
    apiVersion = "external-secrets.io/v1"
    kind       = "ExternalSecret"

    metadata = {
      name      = "${each.value}-supabase"
      namespace = kubernetes_namespace.tenant[each.key].metadata[0].name

      labels = {
        "app.kubernetes.io/part-of" = "ffmpeglab"
        "ffmpeglab.com/tenant"      = each.value
      }
    }

    spec = {
      refreshInterval = var.secret_refresh_interval

      secretStoreRef = {
        kind = "ClusterSecretStore"
        name = var.cluster_secret_store_name
      }

      target = {
        name           = "${each.value}-supabase"
        creationPolicy = "Owner"
      }

      dataFrom = [
        { extract = { key = "${trim(var.tenant_prefix, "/")}/${each.value}" } }
      ]
    }
  }
}

resource "helm_release" "tenant" {
  for_each = toset(local.tenant_slugs)

  name      = each.value
  chart     = var.chart_path != "" ? var.chart_path : "${path.module}/../../helm/ffmpeglab"
  namespace = kubernetes_namespace.tenant[each.key].metadata[0].name

  atomic          = true
  cleanup_on_fail = true
  timeout         = 300

  values = [
    yamlencode(merge(
      {
        tenant = { name = each.value }
        existingSecret = "${each.value}-supabase"
        podAnnotations = merge(
          try(var.chart_values.podAnnotations, {}),
          { "reloader.stakater.com/auto" = "true" },
        )
      },
      var.chart_values,
      var.image_tag != "" ? { image = { tag = var.image_tag } } : {},
    )),
  ]

  depends_on = [kubernetes_manifest.tenant_external_secret]
}