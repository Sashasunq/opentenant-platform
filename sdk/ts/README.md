# OpenTenant Platform SDK

Supabase Extension Template · Vault · NestJS · TypeScript · MIT License

A secure, idempotent foundation for building Supabase extensions that require Vault‑managed secrets, fine‑grained database permissions, and full organization/project management.

This template handles platform user authentication via Supabase Auth, OAuth2 Connect to let users bring their own Supabase projects, provisions dedicated database users per tenant, stores all secrets in HashiCorp Vault, provides an omnidempotent API layer, and exposes REST endpoints for organizations, projects, tenant status, and the OAuth2 flow – ready to use out of the box.

The platform is also the **tenant provisioning authority** for FFmpegLab's Kubernetes deployment: it writes tenant records into Vault, which the [Vault Secrets Operator](#kubernetes-deployment--vso--reloader) turns into cluster Secrets consumed by one Helm release per tenant — with [Reloader](https://github.com/stakater/Reloader) ensuring pods roll automatically whenever a tenant's credentials rotate.

Originaly this template was built for ffmpeglab so ffmpeglab can be here and there as example of tenant


see [docs](https://github.com/opentenant/platform/blob/main/sdk/ts/docs/AppApi.md) for more