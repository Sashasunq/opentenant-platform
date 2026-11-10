output "tenant_slugs" {
  description = "Tenant slugs currently synced from Vault."
  value       = sort([for t in local.tenants : t.slug])
}

output "tenant_count" {
  description = "Number of tenants currently synced."
  value       = length(local.tenants)
}

output "tenant_namespaces" {
  description = "Namespace of each tenant, by slug."
  value       = { for k, ns in kubernetes_namespace_v1.tenant : local.tenants[k].slug => ns.metadata[0].name }
}
