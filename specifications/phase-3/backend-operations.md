# Phase 3 Backend Operations

This runbook covers database upgrade, owner-account lifecycle, cookie-session revocation, and production security configuration for the Phase 3 ASP.NET Core backend. It does not authorize deployment or publication.

## Database upgrade

Keep the existing PostgreSQL volume. Do not run `docker compose down -v`. Inspect and apply the ordered migrations:

```sh
dotnet tool restore
dotnet ef migrations list \
  --project src/backend/OmniRest.Api/OmniRest.Api.csproj \
  --startup-project src/backend/OmniRest.Api/OmniRest.Api.csproj
dotnet ef database update \
  --project src/backend/OmniRest.Api/OmniRest.Api.csproj \
  --startup-project src/backend/OmniRest.Api/OmniRest.Api.csproj
```

`Phase3RestaurantManagement` is additive. It retains Phase 2 menu/publication rows, initializes each restaurant draft version to at least its highest existing publication version, and adds a compatible restaurant object to legacy publication JSON.

Migration is a deployment step and must complete before application instances are marked ready. The publication worker checks for pending migrations before querying the outbox; while a rollout is between migration and application start it waits and logs one informational message instead of repeatedly querying tables that may not exist. This wait is a safety net, not a replacement for the migration-before-start deployment order.

## Controlled owner provisioning

There is no registration HTTP endpoint. The provisioning command takes email, restaurant ID, and display name as arguments, but reads the one-time password only from `OMNIREST_PROVISION_PASSWORD`. Do not put the password on the command line or in logs.

For a local controlled run in zsh:

```sh
read -s 'OMNIREST_PROVISION_PASSWORD?One-time owner password: '
export OMNIREST_PROVISION_PASSWORD
dotnet run --project src/backend/OmniRest.Api/OmniRest.Api.csproj -- \
  --provision-owner owner@example.com 85df1654-099a-58e1-ac09-38599f51a1d7 'Restaurant Owner'
unset OMNIREST_PROVISION_PASSWORD
```

The password must satisfy Identity policy: at least 12 characters with uppercase, lowercase, digit, and non-alphanumeric characters. Delivery of the one-time password is outside the application and must use an approved secret channel.

Production provisioning additionally requires the short-lived controlled-job gate `OMNIREST_ALLOW_OWNER_PROVISIONING=true`. Remove it immediately after the job. The command is idempotent only in the fail-closed sense: an existing email is rejected rather than overwritten.

## Revoke or disable access

Revoke one restaurant membership:

```sh
dotnet run --project src/backend/OmniRest.Api/OmniRest.Api.csproj -- \
  --revoke-owner owner@example.com 85df1654-099a-58e1-ac09-38599f51a1d7
```

Disable the entire owner account:

```sh
dotnet run --project src/backend/OmniRest.Api/OmniRest.Api.csproj -- \
  --disable-owner owner@example.com
```

Production use requires the short-lived `OMNIREST_ALLOW_OWNER_ADMIN=true` job gate. Both operations rotate the Identity security stamp; authenticated requests also check active user and active owner membership on every request, so an existing cookie is rejected immediately. Revocation is auditable and does not delete historical content.

## Session and request security

- Cookie idle lifetime is 30 minutes with sliding renewal; the per-user absolute lifetime is 12 hours and cannot be extended by sliding renewal.
- A successful login rotates the security stamp and session start. A newer login invalidates the previous cookie.
- Cookies are `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`, without `Domain`; Production uses a `__Host-` name.
- `POST /api/v1/auth/login`, logout, retry, and every admin mutation require the antiforgery token returned by `GET /api/v1/auth/antiforgery` in `X-CSRF-TOKEN`.
- Login is limited to five attempts per normalized account identity per 15 minutes, in addition to five-failure Identity lockout. The partition is an HMAC and neither stores nor logs the raw email. Caller-controlled forwarding headers and cookie jars cannot change that partition. A separate high-capacity global circuit protects service capacity without allowing five attempts against one identity to block unrelated owners.
- Admin/auth responses are `private, no-store`; preview also emits `X-Robots-Tag: noindex, nofollow, noarchive`.

## Production fail-closed configuration

Production startup refuses to run without all of the following:

```text
DataProtection__KeyRingPath=/durable/protected/key-ring
DataProtection__CertificateThumbprint=<certificate thumbprint>
ReverseProxy__KnownProxies__0=<trusted proxy IP>
MediaStorage__LocalRoot=/durable/restaurant-media
LoginRateLimit__PartitionKey=<base64 encoding of at least 32 random bytes>
```

The key-ring and media paths must be durable storage, not the container's ephemeral filesystem. The configured valid certificate and private key must be installed in the process account's Current User `My` store. Startup loads exactly one matching valid certificate and protects the persisted key ring with it. Generate the login partition key with a cryptographically secure secret generator, store it in the deployment secret store, and keep it stable across replicas/restarts so one account has one service-wide partition. Treat it, the certificate private key, and the database connection string as secrets. Configure every trusted proxy or CIDR network explicitly; forwarded headers are limited to one hop, and untrusted forwarding headers are stripped. If the Next same-origin proxy terminates TLS, configure its deployment-owned `OMNI_REST_FORWARDED_PROTO=https`; it does not copy client-supplied forwarding headers.

Media uploads write to a randomized tenant/asset path before the relational transaction is committed. Local storage opens the configured root and every tenant component with Linux/macOS directory-descriptor APIs and no-follow flags, then creates and deletes the randomized file relative to that verified directory descriptor. File creation deliberately avoids variadic `open`/`openat` P/Invoke signatures: macOS uses fixed-ABI `mkostempsat_np`, forces mode `0600`, and atomically installs the exact UUID name with `renameatx_np(RENAME_EXCL)`; Linux uses fixed-ABI `mknodat` for atomic create-new, opens the new entry with non-creating `openat` plus no-follow, and forces mode `0600`. A create collision does not overwrite or remove the pre-existing blob. A symlink in the configured root path, an intermediate component, or a tenant directory fails closed. The configured `MediaStorage__LocalRoot` must therefore be an existing physical path without arbitrary symlink components. The implementation normalizes only macOS's immutable `/tmp` and `/var` system aliases to their `/private` paths before descriptor traversal; using the canonical `/private/...` spelling directly remains preferable. Unsupported operating systems fail closed rather than falling back to path-based file access.

The storage lease retains the originally opened tenant-directory descriptor until the relational outcome. If persistence fails or is cancelled after the blob write, compensation deletes only that exact blob through the retained descriptor, even if the tenant path was renamed and replaced by a link meanwhile. Selection and removal deliberately retain successfully committed uploaded assets for later reuse. A critical compensation-failure log contains identifiers but no content or raw owner credentials and requires operator investigation.

Outside Development and Testing, the API enables HSTS and HTTPS redirection. The edge must preserve same-origin routing for `/api/*` and must not cache auth, admin, or preview responses.

## Publication recovery

Every accepted edit commits normalized draft state, an audit event, and an immutable outbox payload tied to the exact draft version in one PostgreSQL transaction. The dispatcher reports `pending`, `processing`, `succeeded`, or `failed`. A hosted worker continuously claims pending work and reclaims processing work after its configured lease expires, so a host crash does not strand publication indefinitely. Failure leaves the prior current publication untouched. An authenticated owner can inspect:

```text
GET /api/v1/admin/publication-status/{operationId}
```

and retry the same immutable operation idempotently with antiforgery protection:

```text
POST /api/v1/admin/publication-status/{operationId}/retry
```

Do not manually flip `is_current` or outbox status in PostgreSQL. Investigate the stable error code, restore the failed dependency, and use the retry endpoint.
