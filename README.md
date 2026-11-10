# OpenTenant Platform


[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Vault](https://img.shields.io/badge/Vault-FFD700?style=for-the-badge&logo=vault&logoColor=black)](https://www.vaultproject.io/)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)

Supabase Extension Template · Vault · NestJS · TypeScript · MIT License

A secure, idempotent foundation for building Supabase extensions that require Vault‑managed secrets, fine‑grained database permissions, and full organization/project management.

This template handles platform user authentication via Supabase Auth, OAuth2 Connect to let users bring their own Supabase projects, provisions dedicated database users per tenant, stores all secrets in HashiCorp Vault, provides an omnidempotent API layer, and exposes REST endpoints for organizations, projects, tenant status, and the OAuth2 flow – ready to use out of the box.

The platform is also the **tenant provisioning authority** for FFmpegLab's Kubernetes deployment: it writes tenant records into Vault, which a secrets operator — [External Secrets Operator](#tenant-sync--terraform--eso) for the platform's tenant sync, or the [Vault Secrets Operator](#kubernetes-deployment--secrets-operator--reloader) for a single instance — turns into cluster Secrets consumed by one Helm release per tenant — with [Reloader](https://github.com/stakater/Reloader) ensuring pods roll automatically whenever a tenant's credentials rotate.

Originaly this template was built for ffmpeglab so ffmpeglab can be here and there as example of tenant

---

## Why This Template?

When building a Supabase extension (e.g., a file processing service, a data sync tool, or an analytics add‑on), you need to solve multiple challenges:

- **Who is using your platform?** – Users sign up/log in via Supabase Auth. The `userId` from the JWT scopes all operations.
- **Which organizations and projects do they have?** – The template integrates with Supabase's Management API to list organizations and their projects.
- **Which Supabase project do they want to connect?** – Users authorise your extension to access their own Supabase project via Supabase Connect (OAuth2).
- **How to provision secure, isolated tenants?** – Creates dedicated database users per `(user, project)` pair, idempotently.
- **How to manage tenant lifecycle?** – Exposes endpoints to enable/disable tenants.

What it gives you:

- Full REST API for organizations, projects, tenants, and the OAuth2 flow.
- Automatic OAuth2 token refresh.
- Secure credential storage in Vault.
- Idempotent provisioning – safe to retry.
- A clear hand-off point to Kubernetes: every tenant record written here becomes deployable infrastructure, with automatic reload on credential rotation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Your Extension (NestJS)                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  @UseGuards(withSupabase) – validates JWT, injects userClaims     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  AppController (REST endpoints)                                   │  │
│  │  - GET /platform/me                                               │  │
│  │  - GET /platform/organizations                                    │  │
│  │  - GET /platform/projects/:orgId                                  │  │
│  │  - GET /platform/tenant/:projectId                                │  │
│  │  - PUT /platform/tenant/:projectId/:status                        │  │
│  │  - GET /platform/login (initiate OAuth2)                          │  │
│  │  - GET /platform/connect/project/:projectId (provision tenant)    │  │
│  │  - GET /platform/oauth2/callback (OAuth2 callback)                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  AppService (core logic)                                          │  │
│  │  - getTenant(), createTenant(), updateTenant()                    │  │
│  │  - createSupaClient() – uses Vault-stored tokens                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   HashiCorp Vault                                       │
│  secret/users/{userId}/session       → OAuth2 session tokens            │
│  secret/users/{userId}/key           → tenant service key               │
│  secret/tenants/{userId}/{projectId} → Tenant records & DB creds        │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ read-only (operator policy)
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              Kubernetes — one Helm release per tenant                   │
│                                                                         │
│   ESO/VSO ──writes──▶ K8s Secret ──watched by──▶ Reloader               │
│                                                 │ secret changed        │
│                                                 ▼                       │
│                              ffmpeglab/server pods                      │
│                       (api / render / logs) rolled automatically        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          Supabase (x2)                                  │
│  ┌─────────────────────────────┐  ┌──────────────────────────────────┐  │
│  │  Your Platform's Supabase   │  │  User's External Supabase        │  │
│  │  - Auth (users table)       │  │  - PostgreSQL (per-tenant user)  │  │
│  │  - Management API           │  │  - Storage                       │  │
│  └─────────────────────────────┘  ┌──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## End-to-End Flow

### Flow 1 – Authentication & Discovery

```
Frontend                     NestJS API                  Supabase
   │                             │                           │
   │ GET /platform/me            │                           │
   │  Authorization: Bearer JWT  │                           │
   │────────────────────────────▶│ withSupabase guard        │
   │◀── user info + hasOAuth? ───│ validates JWT             │
   │                             │                           │
   │ GET /platform/organizations │                           │
   │────────────────────────────▶│ Management API call       │
   │◀── orgs list ───────────────│──────────────────────────▶│
   │                             │                           │
   │ GET /platform/projects/:orgId                           │
   │────────────────────────────▶│ Management API call       │
   │◀── projects list ───────────│──────────────────────────▶│
```

### Flow 2 – OAuth2 Connect (Bring Your Own Supabase)

```
Frontend         NestJS API          Supabase Connect          Vault
   │                 │                       │                   │
   │ GET /login      │                       │                   │
   │────────────────▶│ build OAuth2 URL      │                   │
   │◀─ redirectURI ──│                       │                   │
   │                 │                       │                   │
   │ user authorises in browser ────────────▶│                   │
   │                 │                       │                   │
   │ redirect w/ code: GET /oauth2/callback  │                   │
   │────────────────────────────────────────▶│ exchange code     │
   │                 │◀── access+refresh ────│                   │
   │                 │ save session ────────────────────────────▶│ secret/users/{userId}
   │◀─ redirect to WEBAPP_HOST ──────────────│                   │
```

Expired access tokens are refreshed transparently on every authenticated call:

```ts
getSessionForUser(userId)
  ├─ read secret/users/{userId}/session from Vault
  ├─ if now < created + expires → return session ✅
  └─ else → refresh() via client-oauth2
              ├─ success → saveOauthSession() → overwrite in Vault
              └─ failure → throw 'unable_to_refresh_session'
```

### Flow 3 – Tenant Provisioning (`GET /connect/project/:projectId`)

```
NestJS API                        Vault              User's Supabase Project
    │                               │                          │
    │ getTenant(userId, projectId)  │                          │
    │──────────────────────────────▶│ tenants/{userId}/{proj}  │
    │◀── exists & enabled? ─────────│                          │
    │     YES → return {status:'on'} (idempotent short-circuit)│
    │                                                          │
    │ createSupaClient(userId) ← session token from Vault      │
    │                                                          │
    │ 1. generate DB creds (createPostgresCredentials)         │
    │ 2. fetch anon key ── getProjectApiKeys(reveal:true) ────▶│
    │ 3. apply migration 'ffmpeglab-init'                      │
    │    (initSql + TENANT_SECRET_KEY) ───────────────────────▶│
    │ 4. apply migration 'ffmpeglab-permissions'               │
    │    (CREATE ROLE / GRANTs) ──────────────────────────────▶│
    │ 5. getPoolerConfig ─────────────────────────────────────▶│
    │                                                          │
    │ build SupabaseTenant record                              │
    │  { db creds, keys, host, region, S3 endpoint, flags }    │
    │──────────────────────────────▶│ write tenants/{u}/{p}    │
    │◀── newTenant ─────────────────│                          │
```

### Flow 4 – Tenant Lifecycle & Service Keys

| Action | Path | Effect |
|---|---|---|
| Read | `GET /tenant/:projectId` | Vault read `tenants/{userId}/{projectId}` |
| Toggle | `PUT /tenant/:projectId/:status` | Update `ffmpeglabStatus` on/off in Vault |
| Service key | `getOrCreateTenantServiceKey` | Get-or-create `users/{userId}/key` (idempotent) |
| Validate key | `validateUserTenantServiceKey` | Compare against Vault-stored key |

---

## Vault Secrets Structure

All secrets are stored at paths scoped to the platform `userId`:

| Path | Content |
|---|---|
| `secret/users/{userId}/session` | `{ accessToken, refreshToken, created, expires }` |
| `secret/users/{userId}/key` | `{ secretKey }` – service auth key |
| `secret/tenants/{userId}/{projectId}` | Full tenant record incl. DB creds, anon key, `TENANT_SECRET_KEY`, S3 config |

The tenant record is the contract between this platform and everything downstream (ESO or VSO, Reloader, Helm chart):

```json
{
  "IS_SUPABASE_PLATFORM": true,
  "PIPELINES_API_ENABLED": true,
  "PLATFORM_HOST": "https://platform.ffmpeglab.com",
  "S3_ENDPOINT": "https://{projectId}.storage.supabase.co/storage/v1/s3",
  "S3_REGION": "eu-central-1",
  "SUPABASE_ANON_KEY": "eyJ...",
  "SUPABASE_HOST": "https://{projectId}.supabase.co",
  "SUPABASE_PROJECT_ID": "{projectId}",
  "TENANT_SECRET_KEY": "{password}",
  "TENANT_SERVICE_KEY": "",
  "TENANT_USER_ID": "{userId}",
  "TENANT_WORKER_LOGIN": "worker@ffmpeglab.com"
}
```

Every field becomes a key of the downstream Kubernetes Secret via `envFrom`. No variable name is hardcoded in the chart, so adding a field here requires no change there.

---

## API Endpoints (Fully Implemented)

All endpoints are protected by the `withSupabase` guard, which validates the Supabase JWT from the `Authorization` header and injects the user's claims.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/platform/me` | Authenticated user info; also checks whether an OAuth2 session exists |
| GET | `/platform/organizations` | Lists all Supabase organizations the user belongs to |
| GET | `/platform/projects/:orgId` | Lists all projects within the given organization |
| GET | `/platform/tenant/:projectId` | Retrieves the tenant record (if provisioned): `id, name, status, ffmpeglabStatus, ref, region, created` |
| PUT | `/platform/tenant/:projectId/:status` | Toggles `ffmpeglabStatus` (`"on"`/`"off"`); updates Vault |
| GET | `/platform/login` | Initiates the OAuth2 flow; returns the redirect URI |
| GET | `/platform/connect/project/:projectId` | Provisions a tenant (idempotent). Returns `{ status: 'on' }` |
| GET | `/platform/oauth2/callback` | Exchanges code, stores session in Vault, redirects to frontend |

> Tenant endpoints use the `userId` from the JWT to scope all operations – users can only access their own tenants.

---

## Environment Variables

Create a `.env` file in the root:

```bash
# ============================================
# 1. PLATFORM SUPABASE (Auth & Management API)
# ============================================
SUPABASE_URL=https://your-platform-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_publishable_key   # used by withSupabase guard
SUPABASE_SECRET_KEY=your_service_role_key       # used to validate JWTs
SUPABASE_JWKS_URL=https://your-platform-project.supabase.co/auth/v1/.well-known/jwks.json

# ============================================
# 2. EXTERNAL PROJECT CONNECT (OAuth2)
# ============================================
SUPA_CONNECT_CLIENT_ID=your_client_id
SUPA_CONNECT_CLIENT_SECRET=your_client_secret

# ============================================
# 3. HASHICORP VAULT
# ============================================
VAULT_URL=https://vault.your-domain.com
VAULT_TOKEN=your_vault_token

# ============================================
# 4. SERVICE URLs & PORTS
# ============================================
PLATFORM_HOST=http://localhost:7001          # Your API server URL
WEBAPP_HOST=http://localhost:8080            # Your frontend URL (OAuth redirect)
FFMPEGLAB_PLATFORM_PORT=7001                 # Port for this service

# ============================================
# 5. SECURITY & SESSIONS
# ============================================
TOKEN_EXPIRE_TIME=3600                       # optional, default 3600s
COOKIE_SECRET=your-strong-secret-here        # sign session cookies (min 32 chars)

# ============================================
# 6. DATABASE POOLER (for provisioning users)
# ============================================
SUPABASE_CLOUD_POSTGRES_POOLER_URL=.pooler.supabase.com
SUPABASE_CLOUD_POSTGRES_POOLER_PORT=6543
```

| Variable | Purpose | Required |
|---|---|---|
| `SUPABASE_URL` | Platform Supabase project URL | ✅ Yes |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key for the `withSupabase` guard | ✅ Yes |
| `SUPABASE_SECRET_KEY` | Service role key for JWT validation | ✅ Yes |
| `SUPABASE_JWKS_URL` | JWKS URL for JWT verification | ✅ Yes |
| `SUPA_CONNECT_CLIENT_ID` | OAuth2 client ID from Supabase Connect | ✅ Yes |
| `SUPA_CONNECT_CLIENT_SECRET` | OAuth2 client secret | ✅ Yes |
| `VAULT_URL` | HashiCorp Vault server address | ✅ Yes |
| `VAULT_TOKEN` | Vault authentication token | ✅ Yes |
| `PLATFORM_HOST` | Public URL of this API (for OAuth2 redirects) | ✅ Yes |
| `WEBAPP_HOST` | Frontend URL (post-OAuth redirect target) | ✅ Yes |
| `FFMPEGLAB_PLATFORM_PORT` | Port the server listens on | ✅ Yes |
| `TOKEN_EXPIRE_TIME` | Session expiry in seconds (default 3600) | ❌ Optional |
| `COOKIE_SECRET` | Cookie signing secret (min 32 chars) | ✅ Yes |
| `SUPABASE_CLOUD_POSTGRES_POOLER_URL` | Pooler hostname suffix | ✅ Yes |
| `SUPABASE_CLOUD_POSTGRES_POOLER_PORT` | Pooler port (usually 6543) | ✅ Yes |

---

## Getting Started

### Prerequisites

- Node.js (v22 or newer)
- HashiCorp Vault (self-hosted or cloud)
- Two Supabase projects:
  - **Platform Supabase** – handles authentication for your extension's users.
  - **External Supabase** – the user's own project (connected via OAuth2).
- Supabase Connect configured for OAuth2.
- For cluster deployment: a Kubernetes cluster with ESO (or VSO) and Reloader installed (see below).

### Installation

```bash
git clone https://github.com/ffmpeglab/platform.git my-extension
cd my-extension
npm install
npm run build
npm start
```

### Docker

```bash
docker build -t my-extension .
docker run -p 7001:7001 --env-file .env my-extension
```

### Development

```bash
npm run start:dev   # watch mode
npm run lint
npm run format
npm test
```

---

## Kubernetes Deployment — secrets operator + Reloader

The platform API does not deploy workloads itself. It writes tenant records into Vault; a secrets operator reads them and produces Kubernetes Secrets; one Helm release of the FFmpegLab server runs per tenant.

Two operators appear in this document, for two different deployments, and each cluster uses one:

| Deployment | Who installs the release | Operator that writes the Secret |
|---|---|---|
| Many tenants, driven by the registry | [Tenant sync](#tenant-sync--terraform--eso) in this repository | **External Secrets Operator (ESO)** — one `ExternalSecret` per tenant |
| One instance, on-prem | by hand, per `deploy/vso/README.md` in [ffmpeglab/server](https://github.com/ffmpeglab/server/tree/main/deploy) | **Vault Secrets Operator (VSO)** — one `VaultStaticSecret` |

Either way the Secret is the contract: the chart reads it through `envFrom` and never sees Vault. **[Reloader](https://github.com/stakater/Reloader)** watches those Secrets and rolls the workloads automatically whenever a tenant's credentials change — no manual restarts, no stale credentials.

```
Platform                Vault                Cluster
   │                      │                      │
   │ createTenant()       │                      │
   │─────────────────────▶│ write tenants/{u}/{p}│
   │                      │                      │
   │                      │◀── auth (K8s SA) ────│ ESO / VSO
   │                      │── tenant JSON ──────▶│ K8s Secret
   │                      │                      │
   │                      │                      │ Reloader watches Secret
   │                      │                      │   ├─ on create/update ─▶ rollout
   │                      │                      │ helm upgrade --install
   │                      │                      │ (one release = one tenant)
```

This closes the credential-rotation loop end to end:

> Platform rotates a tenant's credentials in Vault → the operator updates the K8s Secret → Reloader detects the change → pods roll → the instance is running with fresh credentials. No `terraform apply` or `helm upgrade` is involved.

### Responsibility boundary

| Owns | What |
|---|---|
| **This platform** | Creating tenants, writing their records into Vault |
| **Tenant sync** | Turning registry entries into namespaces, ExternalSecrets and releases |
| **ESO / VSO** | Reading the tenant record from Vault, producing the Secret |
| **Reloader** | Watching that Secret, rolling workloads when it changes |
| **The chart** | Deployments, Service, health checks |
| **Cluster owner** | The cluster itself |

> The FFmpegLab deployment never creates a tenant. It receives one — and re-receives it automatically whenever it changes.

### Installing the operators

```bash
# Vault Secrets Operator
helm repo add hashicorp https://helm.releases.hashicorp.com
helm install vault-secrets-operator hashicorp/vault-secrets-operator \
  --namespace vault-secrets-operator --create-namespace \
  --values deploy/vso/values.yaml \
  --set defaultVaultConnection.address=https://<your-vault>

# Reloader
helm repo add stakater https://stakater.github.io/stakater-charts
helm repo update
helm install reloader stakater/reloader
```

### Connecting an external Vault (recommended)

When Vault runs outside the cluster, configure its Kubernetes auth method with explicit reviewer credentials so it can validate service-account tokens:

```bash
  kubectl create serviceaccount vault-reviewer -n vault-secrets-operator
  kubectl create clusterrolebinding vault-reviewer-binding     --clusterrole=system:auth-delegator --serviceaccount=vault-secrets-operator:vault-reviewer
  TOKEN_REVIEWER_JWT=$(kubectl get secret vault-reviewer-token -n vault-secrets-operator -o jsonpath='{.data.token}' | base64 --decode)
```

```bash
vault write auth/kubernetes/config \
    kubernetes_host="https://10.0.0.2:6443" \
    token_reviewer_jwt="${TOKEN_REVIEWER_JWT}" \
    disable_iss_validation=true \
    disable_local_ca_jwt=true \
    kubernetes_ca_cert="-----BEGIN CERTIFICATE-----
MIIDHDCCAgSgAwIBAgIRAOvAAqfto/yAz18axhiAeCkwDQYJKoZIhvcNAQELBQAw
GDEWMBQGA1UEAxMNa3ViZXJuZXRlcy1jYTAeFw0yNjA4MjIyMzA0NTRaFw00NjA4
MjIyMzA0NTRaMBgxFjAUBgNVBAMTDWt1YmVybmV0ZXMtY2EwggEiMA0GCSqGSIb3
DQEBAQUAA4IBDwAwggEKAoIBAQCan4QmLIZPmJUQ2FeECbQ8ah0NxxVU67dBtOQA
XnnMsIpVixbshWErRWqasQihfzr78xh71suJqenrC/ZBlVNMJ/JfdpCiFYdFNwQb
X9GaAOq5EQy6oE/6eSVC5s80dW5zjW+TFkUwV7smTmmIlwzYgmCvhOmT0jeYCCTe
WBExI91uSHJqTe5oLG8NFyE6tUhY9X5JW2HuI/8vtJ0l6ReIZJp7IjaEN2bge+eB
Rtsk3bzh5eS3P8RYnvx6QTzsicetuhIHJAzAqyXxzeRPmaRHQmtbIOZPQ5opoZa2
XxIRtlwqZ/08JBAMWIyGfpUz3Bx9Rp7crHFSEV4Cffvr2N4bAgMBAAGjYTBfMA4G
A1UdDwEB/wQEAwIChDAdBgNVHSUEFjAUBggrBgEFBQcDAgYIKwYBBQUHAwEwDwYD
VR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUb2gUjcjaIKHi+uoqJt7IHf5HzV0wDQYJ
KoZIhvcNAQELBQADggEBAEWVjItSSmEZSp0z0pvkLWQaIt8Bnm6Fn4LzjCplAJrh
Ji879yCJuoA84q74zlg/DWBqxIz7oW/idej5zFclNs9fj4f6vJThi2L9iOVRz+cy
WpIY5UDTczCx7LZLCVMTcgzuS1cL2D2Fg9ebgNO3JqkcN3LjC/JzMF8BmxaDX9n8
XZc37doyq4dPgswlSwY3URs6tOW4FGYhv72nLndsg0WmnpEb+cqPsG0qjol+zeIF
E0dOQkdsN9CmLffsqCFD3O26M3FWlb7ab/+9f39yHU1Agy0TonN8C9X0HHAOMxzX
RSv2UiTcwQK24inLFtKLb27dJHzZBzakmeiJH9hkQ7E=
-----END CERTIFICATE-----"
```

Then bind a role to the service account VSO authenticates as:

```bash
vault policy write ffmpeglab-tenants - <<'HCL'
path "secret/data/tenants/*" {
  capabilities = ["read", "list"]
}
HCL

vault write auth/kubernetes/role/ffmpeglab \
  bound_service_account_names=ffmpeglab-vault \
  bound_service_account_namespaces=ffmpeglab \
  policies=ffmpeglab-tenants \
  ttl=1h
```

Both belong to whoever administers Vault — a deploy-time role cannot enable auth methods.

### Tenant sync — Terraform + ESO

`deploy/tenant-sync/` turns the Vault registry into running tenants. Every record at
`secret/tenants/<userId>/<projectId>` becomes a namespace `ffmpeglab-<projectId>`, an
`ExternalSecret` and a Helm release; removing the record tears all three down on the next run.

```
Vault registry ──list──▶ tenant sync (CronJob) ──creates──▶ namespace · ExternalSecret · helm release
      │                                                              │
      └──────────── ESO reads the record ──▶ Secret ◀── Reloader watches, rolls on change
```

Terraform only lists the registry. It never reads a record, so no credential value reaches
Terraform state: the state holds paths, names and the chart values below, nothing else. ESO
fetches the record inside the cluster, and a rotation reaches the pods within
`secret_refresh_interval` without the sync running at all.

#### Prerequisites

Once per cluster, installed by whoever administers it:

1. **External Secrets Operator** with a Vault role of its own:

   ```sh
   vault write auth/kubernetes/role/external-secrets \
     bound_service_account_names=external-secrets \
     bound_service_account_namespaces=external-secrets \
     policies=ffmpeglab-tenants \
     ttl=1h

   helm repo add external-secrets https://charts.external-secrets.io
   helm install external-secrets external-secrets/external-secrets \
     --namespace external-secrets --create-namespace \
     --version 2.9.0 \
     --set installCRDs=true
   ```

   and the `ClusterSecretStore` the tenants reference (`cluster_secret_store_name`):

   ```yaml
   apiVersion: external-secrets.io/v1
   kind: ClusterSecretStore
   metadata:
     name: vault-backend
   spec:
     provider:
       vault:
         server: https://vault.ffmpeglab.com   # no trailing slash
   #     caBundle: <base64 CA cert>            # only if self-signed TLS
         path: secret                          # KV v2 mount name
         version: v2
         auth:
           kubernetes:
             mountPath: kubernetes
             role: external-secrets
   ```

   ```sh
   kubectl apply -f external-secrets.yml
   kubectl get clustersecretstore vault-backend    # wait for STATUS: True
   ```

2. **Reloader**, as under [Installing the operators](#installing-the-operators).

3. **A Vault role for the sync** that can list the registry and nothing more:

   ```sh
   vault policy write tenant-sync - <<'HCL'
   path "secret/metadata/tenants"   { capabilities = ["list"] }
   path "secret/metadata/tenants/*" { capabilities = ["list"] }
   HCL

   vault write auth/kubernetes/role/tenant-sync \
     bound_service_account_names=tenant-sync \
     bound_service_account_namespaces=platform-system \
     policies=tenant-sync \
     ttl=15m
   ```

4. **The registry marker.** `vault_kv_secrets_list_v2` fails on an empty path rather than
   returning nothing, which would make removing the last tenant impossible. A leaf key keeps
   the listing non-empty; the module ignores it:

   ```sh
   vault kv put -mount=secret tenants/_registry purpose=keeps-the-tenant-listing-non-empty
   ```

5. **A published chart.** The module installs `chart_name` at an exact `chart_version` from
   `chart_repository`, preferably an OCI registry. The FFmpegLab chart lives in
   `ffmpeglab/server` under `deploy/helm/ffmpeglab` and is **not published anywhere yet** —
   publishing it, 0.8.0 or later, is a required step before the
   sync can install anything.

Run them in this order: Terraform plans against the `ExternalSecret` CRD, so ESO must exist first.

#### Running it in the cluster

The sync runs as a CronJob in `platform-system`, every five minutes, one run at a time. It logs
in to Vault with the ServiceAccount token the kubelet projects into the pod. That token rotates
on its own and is read fresh on every run; no copy is written anywhere and no Vault token is
stored. State lives in a Secret in the same namespace through the `kubernetes` backend.

```sh
kubectl apply -f deploy/tenant-sync/k8s/rbac.yaml

kubectl create configmap tenant-sync-tf -n platform-system \
  --from-file=deploy/tenant-sync/

kubectl create configmap tenant-sync-vars -n platform-system \
  --from-literal=TF_VAR_vault_address=https://vault.ffmpeglab.com \
  --from-literal=TF_VAR_chart_repository=oci://<registry>/<namespace> \
  --from-literal=TF_VAR_chart_version=<x.y.z>

kubectl apply -f deploy/tenant-sync/k8s/cronjob.yaml
```

`--from-file` on a directory takes its files and skips `k8s/`, so the manifests stay out of
the module. Re-create `tenant-sync-tf` after changing the module.

The sync can create and delete namespaces and everything the chart puts in them, including
Secrets, since Helm keeps release history there. That is what `rbac.yaml` grants; keep the
ServiceAccount to this one job.

#### Variables

| Variable | Default | |
|---|---|---|
| `vault_address` | — | required |
| `chart_repository` | — | required, e.g. `oci://registry.example.com/charts` |
| `chart_version` | — | required, an exact version |
| `chart_name` | `ffmpeglab` | |
| `vault_role` | `tenant-sync` | |
| `vault_auth_mount` | `kubernetes` | |
| `vault_jwt_path` | the projected ServiceAccount token | |
| `kube_config_path` | `null`, in-cluster | set when running outside the cluster |
| `tenant_mount` / `tenant_prefix` | `secret` / `tenants` | |
| `namespace_prefix` | `ffmpeglab-` | |
| `secret_refresh_interval` | `5m` | how often ESO re-reads each record |
| `cluster_secret_store_name` | `vault-backend` | |
| `chart_values` | `{}` | merged over the defaults for every release |
| `image_tag` | `""` | the chart's `appVersion` when empty |

#### Checking the module without touching anything

```sh
cd deploy/tenant-sync
terraform fmt -check
terraform init -backend=false
terraform validate
```

#### Removing a tenant

`vault kv metadata delete -mount=secret tenants/<userId>/<projectId>`. A plain `vault kv delete`
only marks the latest version deleted, so the key is still listed and ESO keeps failing to read it.

#### Limits

- The record's on/off flag (`ffmpeglabStatus`) is not honoured: reading it would put the record
  into state. A tenant runs while its key exists.
- Helm waits on the `ExternalSecret` becoming `Ready`. If the record is unreadable the release
  is not installed and the run fails rather than leaving a crash-looping tenant.

### Wiring Reloader into the workload

The chart (0.8.0 and later) annotates each Deployment so Reloader picks up changes to the tenant Secret. The annotation comes from the chart's `deploymentAnnotations` value, and the tenant sync sets it explicitly as well. It belongs on the Deployment, not the pod template — Reloader reads the Deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <slug>-ffmpeglab-api
  annotations:
    reloader.stakater.com/auto: "true"        # roll on any referenced Secret/ConfigMap change
spec:
  template:
    spec:
      containers:
        - name: api
          image: ffmpeglab/server:0.6.4
          envFrom:
            - secretRef:
                name: <slug>-supabase         # written by ESO from the Vault record
```

Notes:

- `reloader.stakater.com/auto: "true"` is sufficient here — every component consumes the same tenant Secret via `envFrom`, so any field change triggers a rollout of exactly the affected release.
- Because one release = one tenant, a rotated credential only rolls *that* tenant's pods — multi-tenant blast radius is contained by design.
- The chart's existing `maxSurge: 0` rolling strategy still applies during Reloader-triggered rollouts, protecting the database connection cap.
- If you run GitOps (ArgoCD/Flux), consider `--reload-strategy=annotations` on the Rel controller to avoid sync drift.
- If several tenant fields are updated at once, you can add `deployment.reloader.stakater.com/pause-period: "5m"` to debounce back-to-back rollouts.

### One release = one instance

The application binds one process to one database connection and one queue at startup. It cannot serve two databases. Multi-tenancy therefore lives in the deployment layer: another tenant means another release of the same chart, not a configuration change inside a running one. That is why the chart knows nothing about tenants – it takes its credentials from a Secret that the operator produced from the record this platform wrote, and Reloader keeps it current.

The chart is `deploy/helm/ffmpeglab` in the server repository: api, render and logs, no volumes.

---

## Deployment Behind nginx

The platform is designed to be deployed behind a reverse proxy, typically nginx, which handles routing, CORS headers, and domain restrictions. All services (API, Platform, Supabase) are served from a single domain, preventing cross-origin issues and centralising access control.

```nginx
upstream api {
    server ${FFMPEGLAB_API_FQDN};
}

upstream platform {
    server ${FFMPEGLAB_PLATFORM_FQDN};
}

upstream supabase {
    server ${SUPABASE_FQDN};
}

server {
    listen ${FFMPEGLAB_UI_PORT};
    server_name frontend;
    root /usr/share/nginx/html;

    # Security headers – enforce cross-origin isolation
    add_header cross-origin-embedder-policy "require-corp";
    add_header cross-origin-opener-policy "cross-origin";
    add_header cross-origin-resource-policy "cross-origin";

    location / { try_files $${ESCAPED_URI} /webapp/index.html; }
    location /webapp/ { try_files $${ESCAPED_URI} /webapp/index.html; }
    location = /config.json { try_files $${ESCAPED_URI} $${ESCAPED_URI}/ /webapp/config.json; }
    location = /templates.json { try_files $${ESCAPED_URI} $${ESCAPED_URI}/ /webapp/templates.json; }

    location /auth/    { proxy_pass http://supabase; }
    location /rest/    { proxy_pass http://supabase; }
    location /storage/ { proxy_pass http://supabase; }
    location /platform/ { proxy_pass http://platform; }

    location /api/       { proxy_pass http://api; }
    location /renders/   { proxy_pass http://api; }
    location /files/     { proxy_pass http://api; }
    location /pipelines/ { proxy_pass http://api; }
}
```

Why this setup:

- **Single-domain architecture** – path-based routing eliminates CORS preflight requests and simplifies client-side configuration.
- **Security headers** – strict cross-origin isolation required for features like `SharedArrayBuffer`.
- **Restricted domain** – individual services are never exposed directly; only the approved frontend can reach them.

When deploying your own extension based on this template, point the `platform` upstream at your instance of this service and adjust or remove the other location blocks as needed.

---

## Customising for Your Extension

- **Add business logic** – extend or replace `AppService`.
- **Add new endpoints** – create additional controllers.
- **Adjust OAuth2 scopes** – modify the Supabase Connect request if you need more permissions.
- **Extend tenant provisioning** – e.g., create custom schemas, set up RLS policies, or initialise tables when a tenant is created.
- **Add tenant record fields** – any new field you write into the tenant record automatically reaches the deployed instance as an environment variable via the operator + `envFrom`, and Reloader will roll the pods when it changes.

---

## Key Design Properties

- **Idempotency everywhere** – tenant creation checks Vault first; the service key is get-or-create; migrations are safe to retry.
- **Zero secrets in app state** – all tokens and credentials live only in Vault; the API is stateless.
- **Per-tenant isolation** – dedicated Postgres role per `(userId, projectId)` pair, scoped by the JWT-derived userId.
- **Self-healing sessions** – expired OAuth tokens are transparently refreshed before any Management API call.
- **Self-healing deployments** – credential rotation flows from Vault through ESO or VSO to Reloader-triggered rollouts without human action.
- **Clean hand-off** – the tenant record in Vault is the single contract between provisioning (here) and deployment (Kubernetes).

---

## License

MIT License – see [LICENSE](LICENSE).

## Links

- Website: [opentenant.org](https://opentenant.org)
- GitHub: [github.com/opentenant/platform](https://github.com/opentenant/platform)
- Documentation: [platform.opentenant.org/docs](https://platform.opentenant.org/docs)

Built with ❤️ by the OpenTenant team. Open source, self-hostable, and privacy-first.
